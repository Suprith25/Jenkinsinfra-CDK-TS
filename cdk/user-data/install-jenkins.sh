#!/bin/bash
# The CDK stack prepends `export` lines for: AWS_REGION, ADMIN_SECRET_ID,
# AGENT_KEY_PARAM, AGENT_SSH_USER and AGENT_HOSTS (space-separated agent IPs).
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

PLUGIN_MANAGER_VERSION=2.13.2
CASC_DIR=/var/lib/jenkins/casc
SECRETS_DIR=/etc/jenkins/casc-secrets

# t3.micro has only 1 GiB of RAM, so add 2 GiB of swap to keep Jenkins from
# being killed by the out-of-memory killer.
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

apt-get update
apt-get install -y ca-certificates curl fontconfig openjdk-21-jre
snap install aws-cli --classic

install -d -m 0755 /etc/apt/keyrings
curl --fail --silent --show-error --location \
  https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key \
  --output /etc/apt/keyrings/jenkins-keyring.asc
chmod 0644 /etc/apt/keyrings/jenkins-keyring.asc

echo "deb [signed-by=/etc/apt/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" \
  | tee /etc/apt/sources.list.d/jenkins.list > /dev/null

apt-get update
apt-get install -y jenkins
# The package starts Jenkins immediately; stop it so plugins and configuration
# are in place before the first real start.
systemctl stop jenkins

# Plugins: Configuration as Code, SSH agents (pulls in SSH credentials), git
# and pipeline support.
curl --fail --silent --show-error --location \
  "https://github.com/jenkinsci/plugin-installation-manager-tool/releases/download/${PLUGIN_MANAGER_VERSION}/jenkins-plugin-manager-${PLUGIN_MANAGER_VERSION}.jar" \
  --output /tmp/jenkins-plugin-manager.jar
java -jar /tmp/jenkins-plugin-manager.jar \
  --war /usr/share/java/jenkins.war \
  --plugin-download-directory /var/lib/jenkins/plugins \
  --plugins configuration-as-code ssh-slaves git workflow-aggregator
chown -R jenkins:jenkins /var/lib/jenkins/plugins

# Secrets are read by JCasC from files (one file per ${variable}), never
# written into jenkins.yaml.
install -d -m 0750 -o root -g jenkins "$SECRETS_DIR"
aws secretsmanager get-secret-value --region "$AWS_REGION" \
  --secret-id "$ADMIN_SECRET_ID" --query SecretString --output text \
  > "$SECRETS_DIR/admin_password"
aws ssm get-parameter --region "$AWS_REGION" --with-decryption \
  --name "$AGENT_KEY_PARAM" --query Parameter.Value --output text \
  > "$SECRETS_DIR/agent_ssh_key"
chown root:jenkins "$SECRETS_DIR"/*
chmod 0640 "$SECRETS_DIR"/*

install -d -m 0755 -o jenkins -g jenkins "$CASC_DIR"
# jenkins.yaml is assembled in order: static head, one node per agent, then the
# credentials. ${...} references are resolved by JCasC at Jenkins startup.
{
  cat <<'YAML'
jenkins:
  systemMessage: "Configured by Jenkins Configuration as Code (see cdk/user-data/install-jenkins.sh)"
  numExecutors: 0
  securityRealm:
    local:
      allowsSignup: false
      users:
        - id: "admin"
          password: "${admin_password}"
  authorizationStrategy:
    loggedInUsersCanDoAnything:
      allowAnonymousRead: false
  nodes:
YAML
  i=0
  # shellcheck disable=SC2086 # word splitting of the host list is intended
  for host in $AGENT_HOSTS; do
    i=$((i + 1))
    cat <<NODE
    - permanent:
        name: "agent-$i"
        remoteFS: "/home/$AGENT_SSH_USER/agent"
        numExecutors: 1
        labelString: "linux"
        launcher:
          ssh:
            host: "$host"
            port: 22
            credentialsId: "agent-ssh-key"
            maxNumRetries: 10
            retryWaitTime: 15
            sshHostKeyVerificationStrategy: "nonVerifyingKeyVerificationStrategy"
NODE
  done
  cat <<'YAML'
credentials:
  system:
    domainCredentials:
      - credentials:
          - basicSSHUserPrivateKey:
              scope: SYSTEM
              id: "agent-ssh-key"
              description: "SSH key for the Jenkins agents"
              username: "${AGENT_SSH_USER}"
              privateKeySource:
                directEntry:
                  privateKey: "${agent_ssh_key}"
YAML
} > "$CASC_DIR/jenkins.yaml"
chown jenkins:jenkins "$CASC_DIR/jenkins.yaml"

install -d /etc/systemd/system/jenkins.service.d
cat > /etc/systemd/system/jenkins.service.d/casc.conf <<CONF
[Service]
Environment="JAVA_OPTS=-Djava.awt.headless=true -Djenkins.install.runSetupWizard=false"
Environment="CASC_JENKINS_CONFIG=$CASC_DIR/jenkins.yaml"
Environment="SECRETS=$SECRETS_DIR"
Environment="AGENT_SSH_USER=$AGENT_SSH_USER"
CONF
systemctl daemon-reload

systemctl enable --now jenkins
