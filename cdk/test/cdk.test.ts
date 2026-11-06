import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as Cdk from '../lib/cdk-stack';

test('creates the public VPC, one Jenkins controller and two agents', () => {
  const app = new cdk.App();
  const stack = new Cdk.CdkStack(app, 'MyTestStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::EC2::VPC', 1);
  template.resourceCountIs('AWS::EC2::Subnet', 2);
  template.resourceCountIs('AWS::EC2::InternetGateway', 1);
  template.resourceCountIs('AWS::EC2::NatGateway', 0);
  template.resourceCountIs('AWS::EC2::Instance', 3);
  template.resourceCountIs('AWS::EC2::Route', 2);

  template.hasResourceProperties('AWS::EC2::VPC', {
    CidrBlock: '10.0.0.0/27',
  });

  template.resourcePropertiesCountIs('AWS::EC2::Subnet', {
    CidrBlock: Match.stringLikeRegexp('/28$'),
  }, 2);

  template.hasResourceProperties('AWS::EC2::Subnet', {
    MapPublicIpOnLaunch: true,
  });

  template.hasResourceProperties('AWS::EC2::Route', {
    DestinationCidrBlock: '0.0.0.0/0',
    GatewayId: Match.anyValue(),
  });

  template.hasResourceProperties('AWS::EC2::Instance', {
    InstanceType: 't3.micro',
    KeyName: Match.anyValue(),
    ImageId: Match.stringLikeRegexp('resolve:ssm:/aws/service/canonical/ubuntu/server/24\\.04'),
  });

  const userData = Object.values(template.findResources('AWS::EC2::Instance'))
    .map((instance) => JSON.stringify(instance.Properties.UserData));
  const withJenkins = userData.filter((data) => data.includes('apt-get install -y jenkins'));
  expect(withJenkins).toHaveLength(1);
  expect(withJenkins[0]).toMatch(
    /fallocate -l 2G \/swapfile[\s\S]*openjdk-21-jre[\s\S]*apt-get install -y jenkins[\s\S]*configuration-as-code[\s\S]*systemctl enable --now jenkins/,
  );
  expect(userData.filter((data) => data.includes('install -y ca-certificates fontconfig git openjdk-21-jre'))).toHaveLength(2);

  template.hasResourceProperties('AWS::EC2::SecurityGroup', {
    SecurityGroupIngress: Match.arrayWith([
      Match.objectLike({
        CidrIp: { Ref: 'AllowedCidr' },
        FromPort: 22,
        ToPort: 22,
        IpProtocol: 'tcp',
      }),
      Match.objectLike({
        CidrIp: { Ref: 'AllowedCidr' },
        FromPort: 8080,
        ToPort: 8080,
        IpProtocol: 'tcp',
      }),
    ]),
  });

  template.resourceCountIs('AWS::EC2::SecurityGroup', 2);
  template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
    IpProtocol: 'tcp',
    FromPort: 22,
    ToPort: 22,
    SourceSecurityGroupId: Match.anyValue(),
  });

  template.resourceCountIs('AWS::EC2::KeyPair', 2);
});

test('does not open any port to the whole internet', () => {
  const template = Template.fromStack(new Cdk.CdkStack(new cdk.App(), 'MyTestStack'));
  const groups = template.findResources('AWS::EC2::SecurityGroup');
  for (const group of Object.values(groups)) {
    for (const rule of group.Properties.SecurityGroupIngress ?? []) {
      expect(rule.CidrIp).not.toBe('0.0.0.0/0');
    }
  }
});

test('requires an AllowedCidr in CIDR notation', () => {
  const template = Template.fromStack(new Cdk.CdkStack(new cdk.App(), 'MyTestStack'));
  const pattern = new RegExp(template.toJSON().Parameters.AllowedCidr.AllowedPattern);
  expect(pattern.test('203.0.113.5/32')).toBe(true);
  expect(pattern.test('0.0.0.0/0')).toBe(true);
  expect(pattern.test('203.0.113.5')).toBe(false);
  expect(pattern.test('203.0.113.5/33')).toBe(false);
});

test('spreads agents across Availability Zones and honours agentCount', () => {
  const template = Template.fromStack(
    new Cdk.CdkStack(new cdk.App(), 'MyTestStack', { agentCount: 3 }),
  );
  template.resourceCountIs('AWS::EC2::Instance', 4);

  const subnets = Object.values(template.findResources('AWS::EC2::Instance')).map(
    (instance) => JSON.stringify(instance.Properties.SubnetId),
  );
  expect(new Set(subnets).size).toBe(2);
});

test('controller configures Jenkins through JCasC with secrets from AWS', () => {
  const template = Template.fromStack(new Cdk.CdkStack(new cdk.App(), 'MyTestStack'));

  template.resourceCountIs('AWS::SecretsManager::Secret', 1);
  template.hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: ['secretsmanager:GetSecretValue', 'secretsmanager:DescribeSecret'],
          Effect: 'Allow',
        }),
        Match.objectLike({ Action: Match.arrayWith(['ssm:GetParameter']), Effect: 'Allow' }),
      ]),
    },
  });
  template.hasOutput('AdminPasswordCommand', {});
});
