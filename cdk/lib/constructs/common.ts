import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { readFileSync } from 'fs';
import * as path from 'path';

export const JENKINS_INSTANCE_TYPE = ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO);

export function ubuntuMachineImage(): ec2.IMachineImage {
  return ec2.MachineImage.resolveSsmParameterAtLaunch(
    '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id',
  );
}

export function readUserDataScript(fileName: string): string {
  return readFileSync(path.join(__dirname, '..', '..', 'user-data', fileName), 'utf8');
}
