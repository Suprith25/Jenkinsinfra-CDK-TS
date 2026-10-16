# Jenkins infrastructure with AWS CDK

This repository builds Jenkins infrastructure with AWS CDK and TypeScript.
Infrastructure is being added in stages.

## Stage 1: networking

The CDK stack currently creates:

- One VPC across two Availability Zones.
- One public subnet in each Availability Zone.
- An Internet Gateway and public routes for outbound internet access.
- No NAT Gateways and no EC2 instances yet.

This public-only topology avoids NAT Gateway charges, but any future EC2
instance placed in these subnets can receive a public IPv4 address. Keep
instance security groups restrictive; do not expose SSH or Jenkins broadly to
the internet. Networking is the only infrastructure stage implemented so far.

## Deploy

From the `cdk` directory, configure AWS credentials and a target account/region
with the AWS CLI, then run:

```sh
npm test
npm run build
npx cdk synth
npx cdk deploy
```

The stack outputs the VPC ID and comma-separated public subnet IDs for use in
the next infrastructure stage.
