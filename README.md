# Jenkins infrastructure with AWS CDK

This repository is intended to build Jenkins infrastructure on AWS using
AWS CDK and TypeScript. The infrastructure is being developed in stages so
that the network, compute, and Jenkins installation can be reviewed separately.

> **Current status:** only the networking foundation is implemented. This
> project does not yet create EC2 instances, install Jenkins, or configure a
> Jenkins controller and agents.

## What is included now

The `CdkStack` stack creates:

- One VPC with two Availability Zones.
- One public subnet in each Availability Zone. Each subnet uses a `/24` CIDR.
- An Internet Gateway and public default routes.
- No NAT Gateways, EC2 instances, or Jenkins installation.
- CloudFormation outputs for the VPC ID and comma-separated public subnet IDs.

The subnet configuration is public-only to avoid NAT Gateway charges. Instances
launched into these subnets in a future stage can receive public IPv4 addresses.
The current stack does not open SSH or Jenkins ports, but future instance
security groups must restrict access carefully. Do not expose SSH or the Jenkins
web interface to the whole internet.

## Repository layout

```text
.
├── README.md
└── cdk/
    ├── bin/cdk.ts
    ├── lib/cdk-stack.ts
    ├── test/cdk.test.ts
    ├── cdk.json
    ├── cdk.context.json
    ├── package.json
    ├── package-lock.json
    ├── tsconfig.json
    ├── jest.config.js
    ├── .gitignore
    └── .npmignore
```

## File-by-file guide

### Project documentation

- **`README.md` (this file)** — The main project guide. It explains the
  architecture currently implemented, setup and deployment steps, security and
  cost considerations, and the purpose of each project file.

### CDK application and infrastructure

- **`cdk/bin/cdk.ts`** — The CDK application entry point. It creates a CDK
  `App` and instantiates `CdkStack`. The stack's `env` reads the AWS account
  and region from the environment populated by the selected AWS CLI profile.
  This is why deployment commands use `AWS_PROFILE=jenkins-infra`.
- **`cdk/lib/cdk-stack.ts`** — The infrastructure definition. This is the main
  file to read when learning how the AWS resources are created. It declares a
  VPC with two public subnets in two Availability Zones, disables NAT Gateways,
  and exports the VPC and subnet IDs as CloudFormation outputs. Future
  networking, EC2, and Jenkins resources will be added here or in constructs
  called from this stack.
- **`cdk/test/cdk.test.ts`** — CDK template tests. The test synthesizes the
  stack in memory and checks resource counts and key properties. These tests
  validate what CDK intends to deploy; they do not create AWS resources.

### CDK and TypeScript configuration

- **`cdk/cdk.json`** — CDK CLI settings. Its `app` command tells the CLI how to
  run the TypeScript entry point. The context section contains CDK feature flags
  that make defaults consistent.
- **`cdk/cdk.context.json`** — Cached values returned by CDK lookups, such as
  Availability Zones for an account and region. CDK uses this cache to keep
  synthesis repeatable. It is configuration/cache data, not a place for AWS
  credentials.
- **`cdk/tsconfig.json`** — TypeScript compiler settings, including strict type
  checking and the TypeScript module/runtime target.
- **`cdk/jest.config.js`** — Configures Jest to discover TypeScript tests under
  `test/` and compile them with `ts-jest`.

### Dependencies and generated files

- **`cdk/package.json`** — Project metadata, dependencies, and shortcuts such as
  `npm test` and `npm run build`. Runtime dependencies include `aws-cdk-lib`
  and `constructs`; development dependencies include the CDK CLI, TypeScript,
  Jest, and `ts-jest`.
- **`cdk/package-lock.json`** — Records exact dependency versions for
  reproducible installs. Use `npm ci` to install the locked versions.
- **`cdk/.gitignore`** — Excludes generated JavaScript, type declarations,
  `node_modules`, and CDK synthesis/staging output from Git.
- **`cdk/.npmignore`** — Excludes TypeScript source and generated CDK output
  from npm package contents; it does not affect Git tracking.

## How the CDK files work together

1. You run a command such as `npx cdk synth` or `npx cdk deploy` from `cdk/`.
2. The CDK CLI reads `cdk/cdk.json` and executes the app command, which starts
   `cdk/bin/cdk.ts`.
3. The app creates `CdkStack` from `cdk/lib/cdk-stack.ts`. The stack defines
   the resources as TypeScript constructs.
4. CDK synthesizes those constructs into a CloudFormation template. `synth`
   prints or writes the template locally; `deploy` submits it to AWS.
5. The tests in `cdk/test/cdk.test.ts` synthesize a test instance of the stack
   and assert that the resulting template has the expected shape.

For a first read-through, start with `cdk/bin/cdk.ts` to see how the stack is
started, continue to `cdk/lib/cdk-stack.ts` to see the resources, then read
`cdk/test/cdk.test.ts` to see how those resources are verified.

## Prerequisites

Install and configure:

- Node.js and npm.
- AWS CLI.
- AWS CDK v2 (the project uses the CDK CLI dependency installed through npm).
- An AWS account and credentials allowed to create CloudFormation, VPC,
  Internet Gateway, IAM, Lambda, and related CDK bootstrap resources.

Use an IAM Identity Center/SSO profile or another approved credential method.
Do not put access keys or other secrets in this repository.

## Configure AWS credentials and region

The examples below use an AWS CLI profile named `jenkins-infra` and the
Mumbai region, `ap-south-1`. Replace the profile and region if you use different
values.

For an AWS IAM Identity Center profile:

```sh
aws configure sso --profile jenkins-infra
aws sso login --profile jenkins-infra
```

If the profile does not have a default region configured, set one:

```sh
aws configure set region ap-south-1 --profile jenkins-infra
```

Verify the identity, account, and region before deploying:

```sh
aws sts get-caller-identity --profile jenkins-infra
aws configure get region --profile jenkins-infra
```

The CDK app reads the account and region from the selected AWS profile when
commands are run with `AWS_PROFILE=jenkins-infra`.

## Install, test, and synthesize

Run these commands from the repository root:

```sh
cd cdk
npm ci
npm test
npm run build
AWS_PROFILE=jenkins-infra npx cdk synth
```

`npm test` checks that the synthesized template contains the expected VPC,
subnets, Internet Gateway, and routes, and no NAT Gateway or EC2 instance.
`cdk synth` generates the CloudFormation template locally; it does not deploy
resources.

## Bootstrap and deploy

CDK bootstrap creates a separate `CDKToolkit` CloudFormation stack in the target
account and region. It provides resources CDK uses for deployments, such as an
asset bucket and deployment roles. Bootstrap an account/region once before the
first deployment there:

```sh
AWS_PROFILE=jenkins-infra npx cdk bootstrap
```

Then review and deploy the networking stack:

```sh
AWS_PROFILE=jenkins-infra npx cdk diff CdkStack
AWS_PROFILE=jenkins-infra npx cdk deploy CdkStack
```

CDK displays the proposed changes and asks for confirmation by default. Review
the account, region, and resources before approving. The stack outputs the VPC
ID and public subnet IDs after deployment. You can also inspect them with:

```sh
AWS_PROFILE=jenkins-infra aws cloudformation describe-stacks \
  --stack-name CdkStack \
  --query 'Stacks[0].[StackStatus,Outputs]' \
  --output table
```

## Remove deployed resources

To delete the networking stack and the resources managed by it:

```sh
AWS_PROFILE=jenkins-infra npx cdk destroy CdkStack
```

Confirm the deletion when prompted. This removes the VPC and the resources
created by `CdkStack`. It does **not** remove the separate `CDKToolkit`
bootstrap stack. Normally, keep the bootstrap stack if you expect to deploy
CDK applications to that account and region again. Removing it is a separate
cleanup operation and may affect other CDK applications using the same
environment.

## Planned stages

The intended next stages are to add EC2 compute and then add the scripts and
configuration to install Jenkins. The overall goal is a Jenkins controller
(master) and two agent nodes (slaves). These components are **not implemented**
or deployed by the current code.

## Cost and security notes

- The current stack creates no EC2 instances and has no NAT Gateway.
- AWS may charge for resources or related services; review current AWS pricing
  and your account's billing dashboard before deploying.
- Public subnets have internet routes. Public IPv4 addresses on future instances
  can incur AWS charges.
- Keep credentials outside source control. Use least-privilege AWS permissions.
- Review the synthesized template and CDK deployment diff before deploying.
