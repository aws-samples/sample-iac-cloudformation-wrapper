# Wrapping Terraform with CloudFormation

In this example we deploy a (very) simple [Hashicorp Terraform project](https://developer.hashicorp.com/terraform/tutorials/aws-get-started/infrastructure-as-code) via CloudFormation bootstrap template. The project itself just creates an [AWS SQS Queue](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html).


## Consumer (deployment) experience

Given this setup, your consumers (with appropriate AWS permissions) could upload and deploy the [cfn_bootstrap.yml](cfn_bootstrap.yml) template to their AWS Account via the [CloudFormation Console](https://console.aws.amazon.com/cloudformation/home?#/stacks/create) - or (if you're able to host the template on an AWS S3 bucket they have access to), directly open it via a link like the one below:

[![Launch Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home?#/stacks/create/review?templateURL=https://s3.amazonaws.com/ws-assets-prod-iad-r-iad-ed304a55c2ca1aee/e4a232b7-b0da-4153-b71e-82130a42c00a/tf_cfn_bootstrap.yml&stackName=TFCFnBootstrap "Launch Stack")

As configured:
- An example solution configuration parameter (the visibility timeout of the queue) is exposed for the user to set during CloudFormation deployment
- The CloudFormation stack will create and use its own S3 bucket for Terraform state tracking
- The stack will not show as `CREATE_COMPLETE` until the Terraform deployment is finished (and will fail and roll back if the deployment fails)
- An example output of the Terraform deployment (the ARN of the created SQS queue) is re-published as an output of the CloudFormation stack


## Development experience

The **Terraform CLI version** is specified in the `install` phase in [cfn_bootstrap.yml](./cfn_bootstrap.yml), and via [mise-en-place](https://github.com/jdx/mise) (in [mise.toml](./mise.toml)) for local development. If you don't want to use mise, you can just [install Terraform locally](https://developer.hashicorp.com/terraform/install) by your preferred method.

In general, this folder is a typical Terraform project in which commands like `terraform init`, `terraform apply`, and so on can be run. The main consideration for local development is the **backend configuration**, which must be overridden to `init` successfully.

Note that we don't configure AWS credentials or region explicitly in the TF project, instead assuming that you've [configured your AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-configure.html) - from which they'll be picked up automatically. Similarly when deploying via CloudFormation, the credentials and current AWS region will be picked up from the CodeBuild runtime environment.

### Choosing the Terraform backend

To provide a one-click deployable experience with no external dependencies (but sensible behaviour in the event of updates over time), this pattern deploys an S3 bucket in the target account and uses that to track persistent state for the [Terraform backend](https://developer.hashicorp.com/terraform/language/backend). This bucket is emptied and deleted when the user destroys the CloudFormation stack.

For local TF development (where the state bucket hasn't been created yet), you'll need a different backend configuration - which could even be just to track state in a local file as the simplest option.

You have a few options here:

1. If you already have an S3 bucket in your target AWS account to use for Terraform state management, you can just override our [partial configuration](https://developer.hashicorp.com/terraform/language/backend#partial-configuration) to specify the bucket name by running `terraform init -backend-config "bucket={BUCKET_NAME}"` (which is the same as we do in [cfn_bootstrap.yml](./cfn_bootstrap.yml)).
2. Otherwise, to switch to Terraform's default local file backend, you could simply comment-out the `backend` block in [terraform.tf](./terraform.tf).
3. For more complex multi-environment setups, you could consider Terraform workspaces or multi-folder approaches as detailed in third-party blogs like [[1](https://www.geeksforgeeks.org/devops/how-to-manage-multiple-environments-with-terraform/)], [[2](https://medium.com/@b0ld8/terraform-manage-multiple-environments-63939f41c454)]. You would then need to customize the deployment steps in [cfn_bootstrap.yml](cfn_bootstrap.yml) to, for example, `cd` to a particular environment's subdirectory or configure a particular workspace before running `terraform init`.


## How your Terraform code interacts with the bootstrap

### Code fetch and deployment

Remember the bootstrap CodeBuild job **fetches** your project source code at deploy-time, which means it needs to be accessible from your consumer's target AWS account (or public, if you're sharing your sample publicly). The `CodeRepo` and `CodeRepoBranch` parameters in your bootstrap stack support overriding the source code location at deployment time - which you can use to test an alternative version before release by staging it in a separate, temporary location.

The CLI commands to run the actual Terraform deploy / destroy need to be reflected in the relevant section of the [buildspec](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html) in `cfn_bootstrap.yml`. If you changed these, you'd need to update the bootstrap template to match:

```yaml
pre-build:
  commands:
    ...
build:
  commands:
    ...
    - cd "./${PUBLIC_REPO_FOLDER#/}" && pwd
    - terraform init -backend-config "bucket=$TF_STATE_BUCKET"
    - if [ "$CFN_EVENT_TYPE" = "Delete" ]; then terraform destroy -auto-approve -input=false; else terraform apply -auto-approve -input=false; fi
                
```

As written, the template supports fetching `CodeRepo`s from 1/ .zip archives on Amazon S3, 2/ .zip archives somewhere else (via curl), or 3/ `git clone`able repository URLs. Since for many apps the root folder of the IaC project is not the root folder of the repository, you can use the `CodeRepoFolder` parameter to target which folder your commands should run from.

If you prefer to hard-code the location of your source in the template, rather than exposing it to users as overrideable parameters, you could remove the `CodeRepo`, `CodeRepoBranch`, and `CodeRepoFolder` parameters from the template and instead directly configure the `EnvironmentVariables` on the CodeBuild job.


### Exposing input parameters

For input parameters you **want to expose** from your Terraform project to users at CloudFormation deployment time:

1. In your TF project, define & read the parameter as a root-level [input variable](https://developer.hashicorp.com/terraform/language/values/variables#input-variables) - as we show in [variables.tf](./variables.tf):

```hcl title="variables.tf"
variable "queue_visibility_timeout" {
  default     = 300
  description = "Visibility timeout for the created SQS queue in seconds"
  type        = number
}
```

2. In [cfn_bootstrap.yml](cfn_bootstrap.yml), add your configuration to the `Parameters` section (and update the `ParameterGroups` section [if you're using that](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-cloudformation-interface.html)):

```yaml title="cfn_bootstrap.yml"
Parameters:
  ...
  ExampleVisibilityTimeout:
    Type: Number
    MaxValue: 43200
    MinValue: 0
    Default: 300
    Description: >-
      Example solution parameter exposed to CloudFormation: Visibility time-out of the SQS queue in
      seconds. Must be a whole number.
```

3. Pass the parameter through to the CodeBuild `EnvironmentVariables` with name like `TF_VAR_{your_variable_name}`. These values will be picked up as described [here in the Terraform docs](https://developer.hashicorp.com/terraform/language/values/variables#assigning-values-to-root-module-variables):

```yaml title="cfn_bootstrap.yml"
  CodeBuildProject:
    Type: "AWS::CodeBuild::Project"
    ...
    Properties:
      ...
      Environment:
        ComputeType: BUILD_GENERAL1_LARGE
        EnvironmentVariables:
          ...
          - Name: TF_VAR_queue_visibility_timeout
            Type: PLAINTEXT
            Value: !Ref ExampleVisibilityTimeout
```


### Publishing output values

This pattern supports exposing root-level [output values](https://developer.hashicorp.com/terraform/language/values/outputs) of your Terraform project back to the AWS CloudFormation API and UI, with the `ExampleQueueArn` output provided as an example.

This process is set up in [cfn_bootstrap.yml](./cfn_bootstrap.yml), and works as follows:

1. The value is defined as a root-level output (in [outputs.tf](./outputs.tf)):

```hcl title="outputs.tf"
output "QueueArn" {
  description = "ARN of the created example SQS queue resource"
  value       = aws_sqs_queue.example_queue.arn
}
```

2. We run `terraform output -json > tf.outputs.json` after deployment, to store the Terraform outputs in an (ephemeral) local file in the CodeBuild job

> **Note:** You can skip this step, if you don't need **any** outputs publishing back to CloudFormation

```yaml title="cfn_bootstrap.yml"
        - terraform output -json > tf.outputs.json
```

3. The Python script in the `finally` step (which you won't normally need to edit) checks if that file exists, and passes the name-value map (excluding `sensitive` entries) to CloudFormation as `Data` if so. These attributes can then be referenced in the CloudFormation template via [GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/intrinsic-function-reference-getatt.html) - for example `!GetAtt SampleDeployment.QueueArn`.
4. To publish those resource attributes as overall [outputs](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/outputs-section-structure.html) of the "stack" in the CloudFormation UI, we set up outputs as shown by `ExampleQueueArn`.

```yaml title="cfn_bootstrap.yml"
Outputs:
  ...
  ExampleQueueArn:
    Description: Example re-published CDK output - ARN of the created SQS Queue
    Value: !GetAtt SampleDeployment.QueueArn
```


### Required permissions and security considerations

The `CodeBuildServiceRole` created in cfn_bootstrap.yml is the role that will be used to deploy (and later, update or destroy) your solution - so it needs all the relevant IAM permissions for those operations. This includes accessing your S3 Terraform backend bucket, and creating / updating / deleting whatever resources are defined in your project (just SQS queues for our case).

*Your consumers* (who'll deploy the bootstrap stack to their accounts), will need the permissions required by the bootstrap stack itself: Including CloudFormation, CodeBuild, and access to **create the IAM `CodeBuildServiceRole`**.

As a result, some key considerations include:

1. Your created CodeBuild project will likely be quite privileged.
    - Try to minimize its permissions to only the ones your solution needs (the same minimal set for developers to be able to deploy it). We've provided an example policy `SQSExampleDeploymentPerms`, and commented-out broader `PowerUserAccess` you could consider using to initially debug deployment when working with new resource types.
    - Educate your consumers on the importance of restricting users' access *to the CodeBuild project* in their target AWS account.
2. Permissions to create IAM roles and policies are quite powerful, so many organizations restrict them. Check your consumers will have sufficient access to deploy the bootstrap stack (which creates roles and policies).


### ⚠️ Other configurations and some important warnings

Your `Custom::CodeBuildTrigger` resource in the CloudFormation bootstrap has some other parameters with sensible defaults but that you might need to be aware of:

- `BuildOnDelete`: Set `true` (as we have) to run the `terraform destroy` command when the bootstrap stack is deleted. By default (`false`) deleting the bootstrap stack itself won't re-run the CodeBuild job and therefore won't delete the actual Terraform-managed resources that were deployed.
    - If you **want** to preserve the solution when the CloudFormation stack's destroyed though, you should also *remove* the `TFStateCleanUpExecutionRole`, `TFStateCleanUpFunction`, and `EmptyTFStateBucketOnDelete` resources and set a `DeletionPolicy: Retain` [deletion policy](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-deletionpolicy.html) on the `TFStateBucket` - to preserve the Terraform state too.
- `CodeBuildCallback`: Set `true` (as we have) to **wait** for the CodeBuild project to run.
    - By default (`false`), the `SampleDeployment` resource would return `CREATE_COMPLETE` as soon as the CodeBuild job is started
    - ⚠️ You can **only** publish TF outputs back to the bootstrap stack if this parameter is set to `true`
    - ⚠️ You can **only** set this parameter to `false` if your TF deployment will take longer than 1 hour - otherwise CloudFormation will time out, treat the deployment as failed, and begin rolling back.
- `IgnoreUpdate`: Set `true` to **ignore** any `UPDATE` events. By default (`false`), updating the bootstrap stack *in a way that updates the input properties* of your `SampleDeployment` will re-trigger CodeBuild to run your `terraform apply` again.

Consider using [Checkov](https://github.com/bridgecrewio/checkov) to detect opportunities to harden the CloudFormation and Terraform security configurations before working towards deploying in production environments:

```sh
checkov --directory . --quiet
```

## Debugging

As a developer, you'll generally do most of your testing and debugging on the Terraform project itself. The bootstrap CloudFormation template only needs to be touched when changing the set of configuration parameters or outputs that need to be exposed to your consumers through the one-click deployable CloudFormation.

When a bootstrap-driven deployment goes wrong, you'll typically see a `CREATE_FAILED` event on the resource that represents the actual deployment (`SampleDeployment` as we've named it), and the place to look for detailed error logs will be the CodeBuild project/build that was running the deployment script.

If you're deploying the bootstrap with rollback enabled (the default in CloudFormation), you might find this CodeBuild project was deleted already when you come to investigate. However, the logs should still be available in [CloudWatch log groups](https://console.aws.amazon.com/cloudwatch/home?#logsV2:log-groups) under `/aws/codebuild/{build-project-id}>{build UID}`. ⚠️ Note that you'll probably see two builds: the initial one triggered by the `CREATE` (likely the most interesting), and then the one triggered by CloudFormation's roll-back `DELETE` event.
