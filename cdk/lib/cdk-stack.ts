import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as path from 'path';
import { readFileSync } from 'fs';

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const vpc = new ec2.Vpc(this, 'JenkinsVpc', {
      ipAddresses: ec2.IpAddresses.cidr('10.0.0.0/27'),
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: 'Public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 28,
        },
      ],
    });

    new cdk.CfnOutput(this, 'VpcId', {
      value: vpc.vpcId,
      description: 'ID of the Jenkins VPC',
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: cdk.Fn.join(',', vpc.publicSubnets.map((subnet) => subnet.subnetId)),
      description: 'Comma-separated IDs of the public subnets',
    });

    const sshPublicKey = new cdk.CfnParameter(this, 'SshPublicKey', {
      type: 'String',
      description: 'Your SSH public key (for example, the contents of ~/.ssh/jenkins-practice.pub)',
      minLength: 1,
    });

    const keyPair = new ec2.KeyPair(this, 'JenkinsKeyPair', {
      publicKeyMaterial: sshPublicKey.valueAsString,
    });

    const jenkinsSecurityGroup = new ec2.SecurityGroup(this, 'JenkinsSecurityGroup', {
      vpc,
      description: 'Allow SSH and Jenkins web access',
      allowAllOutbound: true,
    });
    jenkinsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22), 'SSH');
    jenkinsSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8080), 'Jenkins web interface');

    const userData = ec2.UserData.custom(
      readFileSync(path.join(__dirname, '..', 'user-data', 'install-jenkins.sh'), 'utf8'),
    );

    const jenkinsInstance = new ec2.Instance(this, 'JenkinsInstance', {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.resolveSsmParameterAtLaunch(
        '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id',
      ),
      keyPair,
      securityGroup: jenkinsSecurityGroup,
      userData,
    });

    const agentSecurityGroup = new ec2.SecurityGroup(this, 'JenkinsAgentSecurityGroup', {
      vpc,
      description: 'Allow SSH from the Jenkins controller only',
      allowAllOutbound: true,
    });
    agentSecurityGroup.addIngressRule(
      jenkinsSecurityGroup,
      ec2.Port.tcp(22),
      'SSH from Jenkins controller',
    );

    const agentUserData = readFileSync(path.join(__dirname, '..', 'user-data', 'install-agent.sh'), 'utf8');

    ['1', '2'].forEach((agentNumber, index) => {
      const agentInstance = new ec2.Instance(this, `JenkinsAgent${agentNumber}`, {
        vpc,
        vpcSubnets: { subnets: [vpc.publicSubnets[index % vpc.publicSubnets.length]] },
        instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
        machineImage: ec2.MachineImage.resolveSsmParameterAtLaunch(
          '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id',
        ),
        keyPair,
        securityGroup: agentSecurityGroup,
        userData: ec2.UserData.custom(agentUserData),
      });

      new cdk.CfnOutput(this, `JenkinsAgent${agentNumber}PrivateIp`, {
        value: agentInstance.instancePrivateIp,
        description: `Private IP of Jenkins agent ${agentNumber} (use this in the Jenkins node config)`,
      });
    });

    new cdk.CfnOutput(this, 'JenkinsInstanceId', {
      value: jenkinsInstance.instanceId,
      description: 'ID of the Jenkins EC2 instance',
    });

    new cdk.CfnOutput(this, 'JenkinsPublicIp', {
      value: jenkinsInstance.instancePublicIp,
      description: 'Public IP address of the Jenkins EC2 instance',
    });

    new cdk.CfnOutput(this, 'JenkinsUrl', {
      value: `http://${jenkinsInstance.instancePublicIp}:8080`,
      description: 'URL of the Jenkins web interface',
    });
  }
}
