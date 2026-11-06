import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { JenkinsAgents } from './jenkins-agents';
import { JENKINS_INSTANCE_TYPE, readUserDataScript, ubuntuMachineImage } from './common';

export interface JenkinsControllerProps {
  readonly vpc: ec2.IVpc;
  /** Key pair for the human operator's SSH access to the controller. */
  readonly keyPair: ec2.IKeyPair;
  /** CIDR allowed to reach SSH (22) and the Jenkins web interface (8080). */
  readonly allowedCidr: string;
  readonly agents: JenkinsAgents;
}

/**
 * Jenkins controller, configured at first boot through Jenkins Configuration as
 * Code (JCasC): admin user, agent SSH credential and agent nodes.
 */
export class JenkinsController extends Construct {
  public readonly instance: ec2.Instance;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly adminPassword: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: JenkinsControllerProps) {
    super(scope, id);

    this.securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc: props.vpc,
      description: 'Allow SSH and Jenkins web access',
      allowAllOutbound: true,
    });
    const allowed = ec2.Peer.ipv4(props.allowedCidr);
    this.securityGroup.addIngressRule(allowed, ec2.Port.tcp(22), 'SSH');
    this.securityGroup.addIngressRule(allowed, ec2.Port.tcp(8080), 'Jenkins web interface');

    props.agents.securityGroup.addIngressRule(
      this.securityGroup,
      ec2.Port.tcp(22),
      'SSH from Jenkins controller',
    );

    this.adminPassword = new secretsmanager.Secret(this, 'AdminPassword', {
      description: 'Password of the Jenkins "admin" user',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      generateSecretString: { passwordLength: 24, excludePunctuation: true },
    });

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      `export AWS_REGION='${cdk.Aws.REGION}'`,
      `export ADMIN_SECRET_ID='${this.adminPassword.secretArn}'`,
      `export AGENT_KEY_PARAM='${props.agents.keyPair.privateKey.parameterName}'`,
      `export AGENT_SSH_USER='${props.agents.sshUser}'`,
      `export AGENT_HOSTS='${props.agents.privateIps.join(' ')}'`,
      readUserDataScript('install-jenkins.sh'),
    );

    this.instance = new ec2.Instance(this, 'JenkinsInstance', {
      vpc: props.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: JENKINS_INSTANCE_TYPE,
      machineImage: ubuntuMachineImage(),
      keyPair: props.keyPair,
      securityGroup: this.securityGroup,
      userData,
    });

    this.adminPassword.grantRead(this.instance.role);
    props.agents.keyPair.privateKey.grantRead(this.instance.role);
  }
}
