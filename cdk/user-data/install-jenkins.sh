#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

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
