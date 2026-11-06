import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { JenkinsAgents } from './constructs/jenkins-agents';
import { JenkinsController } from './constructs/jenkins-controller';
import { JenkinsNetwork } from './constructs/jenkins-network';

export interface CdkStackProps extends cdk.StackProps {
  /** Number of Jenkins agent instances. Defaults to 2. */
  readonly agentCount?: number;
}

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CdkStackProps = {}) {
    super(scope, id, props);

    const sshPublicKey = new cdk.CfnParameter(this, 'SshPublicKey', {
      type: 'String',
      description: 'Your SSH public key (for example, the contents of ~/.ssh/jenkins-practice.pub)',
      minLength: 1,
    });

    const allowedCidr = new cdk.CfnParameter(this, 'AllowedCidr', {
      type: 'String',
      description: 'CIDR allowed to reach SSH and the Jenkins web interface, e.g. 203.0.113.5/32',
      allowedPattern: '^(\\d{1,3}\\.){3}\\d{1,3}/(\\d|[12]\\d|3[0-2])$',
      constraintDescription: 'Must be an IPv4 CIDR such as 203.0.113.5/32',
    });

    const network = new JenkinsNetwork(this, 'Network');

    const keyPair = new ec2.KeyPair(this, 'JenkinsKeyPair', {
      publicKeyMaterial: sshPublicKey.valueAsString,
    });

    const agents = new JenkinsAgents(this, 'Agents', {
      vpc: network.vpc,
      agentCount: props.agentCount ?? 2,
    });

    const controller = new JenkinsController(this, 'Controller', {
      vpc: network.vpc,
      keyPair,
      allowedCidr: allowedCidr.valueAsString,
      agents,
    });

    new cdk.CfnOutput(this, 'VpcId', {
      value: network.vpc.vpcId,
      description: 'ID of the Jenkins VPC',
    });

    new cdk.CfnOutput(this, 'PublicSubnetIds', {
      value: cdk.Fn.join(',', network.vpc.publicSubnets.map((subnet) => subnet.subnetId)),
      description: 'Comma-separated IDs of the public subnets',
    });

    agents.privateIps.forEach((ip, index) => {
      new cdk.CfnOutput(this, `JenkinsAgent${index + 1}PrivateIp`, {
        value: ip,
        description: `Private IP of Jenkins agent ${index + 1}`,
      });
    });

    new cdk.CfnOutput(this, 'JenkinsInstanceId', {
      value: controller.instance.instanceId,
      description: 'ID of the Jenkins EC2 instance',
    });

    new cdk.CfnOutput(this, 'JenkinsPublicIp', {
      value: controller.instance.instancePublicIp,
      description: 'Public IP address of the Jenkins EC2 instance',
    });

    new cdk.CfnOutput(this, 'JenkinsUrl', {
      value: `http://${controller.instance.instancePublicIp}:8080`,
      description: 'URL of the Jenkins web interface',
    });

    new cdk.CfnOutput(this, 'AdminPasswordCommand', {
      value: `aws secretsmanager get-secret-value --secret-id ${controller.adminPassword.secretArn} --query SecretString --output text`,
      description: 'Command that prints the Jenkins admin password (user: admin)',
    });
  }
}
