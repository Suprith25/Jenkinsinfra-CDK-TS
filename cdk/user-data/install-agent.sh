#!/bin/bash
set -euxo pipefail

export DEBIAN_FRONTEND=noninteractive

# t3.micro has only 1 GiB of RAM, so add 2 GiB of swap for build workloads.
if ! swapon --show | grep -q '/swapfile'; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Jenkins agents only need a Java runtime; the controller connects over SSH
# and runs the agent process itself.
apt-get update
apt-get install -y ca-certificates fontconfig git openjdk-21-jre
