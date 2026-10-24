#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y ca-certificates curl fontconfig openjdk-21-jre

install -d -m 0755 /etc/apt/keyrings
curl --fail --silent --show-error --location \
  https://pkg.jenkins.io/debian-stable/jenkins.io-2026.key \
  --output /etc/apt/keyrings/jenkins-keyring.asc
chmod 0644 /etc/apt/keyrings/jenkins-keyring.asc

echo "deb [signed-by=/etc/apt/keyrings/jenkins-keyring.asc] https://pkg.jenkins.io/debian-stable binary/" \
  | tee /etc/apt/sources.list.d/jenkins.list > /dev/null

apt-get update
apt-get install -y jenkins
systemctl enable --now jenkins
