import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

/** Public-only VPC (no NAT Gateways) spanning two Availability Zones. */
export class JenkinsNetwork extends Construct {
  public readonly vpc: ec2.Vpc;

  constructor(scope: Construct, id: string) {
    super(scope, id);

    this.vpc = new ec2.Vpc(this, 'JenkinsVpc', {
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
  }
}
