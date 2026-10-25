import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as Cdk from '../lib/cdk-stack';

test('creates the public VPC and one Jenkins EC2 instance', () => {
  const app = new cdk.App();
  const stack = new Cdk.CdkStack(app, 'MyTestStack');
  const template = Template.fromStack(stack);

  template.resourceCountIs('AWS::EC2::VPC', 1);
  template.resourceCountIs('AWS::EC2::Subnet', 2);
  template.resourceCountIs('AWS::EC2::InternetGateway', 1);
  template.resourceCountIs('AWS::EC2::NatGateway', 0);
  template.resourceCountIs('AWS::EC2::Instance', 1);
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
    UserData: {
      'Fn::Base64': Match.stringLikeRegexp(
        'fallocate -l 2G /swapfile[\\s\\S]*swapon /swapfile[\\s\\S]*apt-get install -y ca-certificates curl fontconfig openjdk-21-jre[\\s\\S]*apt-get install -y jenkins[\\s\\S]*systemctl enable --now jenkins',
      ),
    },
  });

  template.hasResourceProperties('AWS::EC2::SecurityGroup', {
    SecurityGroupIngress: Match.arrayWith([
      Match.objectLike({
        CidrIp: '0.0.0.0/0',
        FromPort: 22,
        ToPort: 22,
        IpProtocol: 'tcp',
      }),
      Match.objectLike({
        CidrIp: '0.0.0.0/0',
        FromPort: 8080,
        ToPort: 8080,
        IpProtocol: 'tcp',
      }),
    ]),
  });

  template.resourceCountIs('AWS::EC2::KeyPair', 1);
});
