# Jenkins infrastructure with AWS CDK

This repository is intended to build Jenkins infrastructure on AWS using
AWS CDK and TypeScript. The infrastructure is being developed in stages so
that the network, compute, and Jenkins installation can be reviewed separately.

> **Current status:** the project creates the networking foundation and one
> practice Jenkins EC2 instance. It does not create the two planned agent
> instances or configure Jenkins agents.

## What is included now

The `CdkStack` stack creates:

- One VPC with CIDR `10.0.0.0/27` spanning two Availability Zones.
- One public `/28` subnet in each Availability Zone.
- An Internet Gateway and public default routes.
- No NAT Gateways.
- One `t3.micro` EC2 instance running Ubuntu Server 24.04 LTS.
- EC2 user data installs Java 21 (a Jenkins runtime dependency) and Jenkins
  using Ubuntu's `apt` package manager.
- Inbound SSH (port 22) and Jenkins web access (port 8080) from any IPv4
  address, as configured for this practice setup.
- CloudFormation outputs for the VPC ID and comma-separated public subnet IDs.

The small CIDR allocation is intended for the planned practice setup of one
Jenkins controller and two agents. Each `/28` subnet contains 16 IPv4 addresses;
AWS reserves five in each subnet, leaving 11 usable addresses per subnet. `/28`
is the smallest IPv4 subnet size AWS supports. This compact layout leaves
limited room for additional resources, so revisit the CIDR sizes before adding
load balancers, interface endpoints, or more instances.

The subnets are public to avoid NAT Gateway charges. The instance receives a
public IPv4 address. **For this practice setup, SSH and Jenkins port 8080 are
open to the entire IPv4 internet (`0.0.0.0/0`). This is risky.** Use only a
temporary practice instance, keep its SSH private key secure, and change the
security-group rules to your own IP before using it for real work. Do not use
this public access configuration for production.

The `t3.micro` type is a small practice size, not a guarantee of free usage.
Free-tier eligibility and charges depend on account age, region, usage, and
AWS's current pricing terms. Jenkins can also be memory-constrained on a
micro instance.

## Repository layout

```text
.
├── README.md
└── cdk/
    ├── bin/cdk.ts
    ├── lib/cdk-stack.ts
    ├── test/cdk.test.ts
    ├── user-data/install-jenkins.sh
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
  VPC with two public subnets in two Availability Zones, a security group, an
  SSH key-pair resource based on a public-key deployment parameter, one EC2
  instance, and CloudFormation outputs. The EC2 instance uses the install
  script under `cdk/user-data/`.
- **`cdk/user-data/install-jenkins.sh`** — The Ubuntu user-data script executed
  when the EC2 instance first boots. It installs Java 21 and Jenkins from the
  Jenkins Debian stable repository, then enables and starts the Jenkins service.
  The private SSH key is not part of this file or repository.
- **`cdk/test/cdk.test.ts`** — CDK template tests. The test synthesizes the
  stack in memory and checks resource counts and key properties, including the
  instance type, user data, and security-group ingress. These tests validate
  what CDK intends to deploy; they do not create AWS resources.

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
subnets, Internet Gateway, routes, EC2 instance, user data, and security rules.
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

Review the planned changes:

```sh
AWS_PROFILE=jenkins-infra npx cdk diff CdkStack
```

Create an ED25519 SSH key pair locally if you do not already have one for this
practice instance. The private key stays on your computer; only the `.pub`
public key is passed to CDK:

```sh
ssh-keygen -t ed25519 -f ~/.ssh/jenkins-practice -C "jenkins-practice"
```

Deploy the stack and provide your public key as a CloudFormation parameter:

```sh
AWS_PROFILE=jenkins-infra npx cdk deploy CdkStack \
  --parameters CdkStack:SshPublicKey="$(cat ~/.ssh/jenkins-practice.pub)"
```

CDK displays the proposed changes and asks for confirmation by default. Review
the account, region, public inbound rules, and resources before approving. The
stack outputs VPC/subnet IDs and the instance ID, public IP, and Jenkins URL.
Inspect them with:

```sh
AWS_PROFILE=jenkins-infra aws cloudformation describe-stacks \
  --stack-name CdkStack \
  --query 'Stacks[0].[StackStatus,Outputs]' \
  --output table
```

Wait for instance initialization to finish before opening the Jenkins URL.
Connect over SSH with the private key:

```sh
ssh -i ~/.ssh/jenkins-practice ubuntu@PUBLIC_IP
```

Replace `PUBLIC_IP` with the `JenkinsPublicIp` output. Retrieve the initial
administrator password on the instance:

```sh
sudo cat /var/lib/jenkins/secrets/initialAdminPassword
```

Open the `JenkinsUrl` output in your browser and enter that password to finish
the Jenkins setup wizard.

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

The next stage is to add two Jenkins agent instances and configure them to
connect to the controller. The current stack creates only the controller.

## Cost and security notes

- The stack creates one EC2 instance and has no NAT Gateway. EC2, EBS, data
  transfer, and public IPv4 charges may apply even if the instance type is
  described as free-tier eligible.
- AWS may charge for resources or related services; review current AWS pricing
  and your account's billing dashboard before deploying.
- This practice stack intentionally exposes SSH and Jenkins 8080 to all IPv4
  addresses. Restrict both ingress rules to a trusted IP before using it beyond
  a temporary personal exercise.
- Keep credentials outside source control. Use least-privilege AWS permissions.
- Review the synthesized template and CDK deployment diff before deploying.
