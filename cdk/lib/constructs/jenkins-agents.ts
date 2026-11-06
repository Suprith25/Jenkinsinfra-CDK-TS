import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { JENKINS_INSTANCE_TYPE, readUserDataScript, ubuntuMachineImage } from './common';

export interface JenkinsAgentsProps {
  readonly vpc: ec2.IVpc;
  /** Number of agent instances, spread round-robin across the public subnets. */
  readonly agentCount: number;
}

/**
 * Jenkins agent instances. They use a dedicated CDK-generated key pair whose
 * private key lands in SSM Parameter Store, so the controller can fetch it and
 * register it as a Jenkins credential without any manual step.
 */
export class JenkinsAgents extends Construct {
  /** OS user the controller logs in as (the Ubuntu AMI default). */
  public readonly sshUser = 'ubuntu';
  public readonly keyPair: ec2.KeyPair;
  public readonly securityGroup: ec2.SecurityGroup;
  public readonly privateIps: string[] = [];

  constructor(scope: Construct, id: string, props: JenkinsAgentsProps) {
    super(scope, id);

    this.keyPair = new ec2.KeyPair(this, 'AgentKeyPair');

    this.securityGroup = new ec2.SecurityGroup(this, 'SecurityGroup', {
      vpc: props.vpc,
      description: 'Allow SSH from the Jenkins controller only',
      allowAllOutbound: true,
    });

    const userData = readUserDataScript('install-agent.sh');
    const subnets = props.vpc.publicSubnets;

    for (let i = 0; i < props.agentCount; i++) {
      const agentNumber = i + 1;
      const instance = new ec2.Instance(this, `JenkinsAgent${agentNumber}`, {
        vpc: props.vpc,
        vpcSubnets: { subnets: [subnets[i % subnets.length]] },
        instanceType: JENKINS_INSTANCE_TYPE,
        machineImage: ubuntuMachineImage(),
        keyPair: this.keyPair,
        securityGroup: this.securityGroup,
        userData: ec2.UserData.custom(userData),
      });
      this.privateIps.push(instance.instancePrivateIp);
    }
  }
}
