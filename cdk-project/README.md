# Wrapping CDK with CloudFormation

In this example we deploy a (very) simple [AWS CDK app](https://docs.aws.amazon.com/cdk/v2/guide/apps.html) via CloudFormation bootstrap template. The app itself just creates an [AWS SQS Queue](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/welcome.html).


## Consumer (deployment) experience

Given this setup, your consumers (with appropriate AWS permissions) could upload and deploy the [cfn_bootstrap.yml](cfn_bootstrap.yml) template to their AWS Account via the [CloudFormation Console](https://console.aws.amazon.com/cloudformation/home?#/stacks/create) - or (if you're able to host the template on an AWS S3 bucket they have access to), directly open it via a link like the one below:

[![Launch Stack](https://s3.amazonaws.com/cloudformation-examples/cloudformation-launch-stack.png)](https://console.aws.amazon.com/cloudformation/home?#/stacks/create/review?templateURL=https://s3.amazonaws.com/ws-assets-prod-iad-r-iad-ed304a55c2ca1aee/e4a232b7-b0da-4153-b71e-82130a42c00a/cdk_cfn_bootstrap.yml&stackName=CDKCFnBootstrap "Launch Stack")

As configured:
- An example solution configuration parameter (the visibility timeout of the queue) is exposed for the user to set during bootstrap deployment
- The "bootstrap" stack will not show as `CREATE_COMPLETE` until the CDK deployment is finished (and will fail and roll back if the CDK deployment fails)
- An example output of the CDK deployment (the ARN of the created SQS queue) is re-published as an output of the bootstrap stack

Since CDK itself uses CloudFormation to orchestrate deployments, users will see a second stack (`CdkFromCloudFormationExample`) gets created during the deployment - and this is the actual solution infrastructure.


## Development experience

This project is derived from the same base template you'd get by running `npx cdk init app --language=typescript` (see the [CLI reference](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-init.html)).

(After `git clone`ing a local copy of the code, and with NodeJS installed), developers could run standard CDK commands (from this folder) like:

- `npm install` - Install the dependencies
- `npm run lint` - Lint & format the source code
- `npm run test` - Run the included tests
- `npx cdk synth` - Emit the [synthesized](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-synth.html) CloudFormation template(s) of the app
- `npx cdk deploy` - Deploy the stack(s) to the currently-selected AWS account & region

Note that we've specified the `aws-cdk` CLI as a dependency in the [package.json](./package.json) of the project itself, rather than assuming it's installed globally on your machine as some CDK guides suggest.

## How your CDK code interacts with the bootstrap

### Code fetch and deployment

Remember the bootstrap CodeBuild job **fetches** your project source code at deploy-time, which means it needs to be accessible from your consumer's target AWS account (or public, if you're sharing your sample publicly). The `CodeRepo` and `CodeRepoBranch` parameters in your bootstrap stack support overriding the source code location at deployment time - which you can use to test an alternative version before release by staging it in a separate, temporary location.

The CLI commands to install the project, bootstrap CDK, and run the actual deploy / destroy need to be reflected in the relevant section of the [buildspec](https://docs.aws.amazon.com/codebuild/latest/userguide/build-spec-ref.html) in `cfn_bootstrap.yml`. If you changed these (for example, it's a Python CDK project using Poetry or uv - or a NodeJS project with a defined `npm run deploy` script), you'd need to update the bootstrap template to match:

```yaml
pre-build:
  commands:
    ...
build:
  commands:
    ...
    - npm install
    - npx cdk bootstrap
    - if [ "$CFN_EVENT_TYPE" = "Delete" ]; then npx cdk destroy --all --force; else npx cdk deploy --all --concurrency 8 --require-approval never; fi
```

As written, the template supports fetching `CodeRepo`s from 1/ .zip archives on Amazon S3, 2/ .zip archives somewhere else (via curl), or 3/ `git clone`able repository URLs. Since for many apps the root folder of the IaC project is not the root folder of the repository, you can use the `CodeRepoFolder` parameter to target which folder your commands should run from.

If you prefer to hard-code the location of your source in the template, rather than exposing it to users as overrideable parameters, you could remove the `CodeRepo`, `CodeRepoBranch`, and `CodeRepoFolder` parameters from the template and instead directly configure the `EnvironmentVariables` on the CodeBuild job.


### Exposing input parameters

For any solution parameters you **want to expose** from your CDK app to users at CloudFormation deployment time:

In [cfn_bootstrap.yml](cfn_bootstrap.yml):
1. Add your configuration to the `Parameters` section (like our `ExampleVisibilityTimeout`) - and update the `ParameterGroups` section [if you're using that](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/aws-cloudformation-interface.html).
2. Pass your parameter through to the CodeBuild `EnvironmentVariables` (like our `EXAMPLE_VISIBILITY_TIMEOUT`)
3. In your CDK app, support configuring the value via your chosen environment variable (like our `queueVisibilityTimeout`)
    - Remember, the `Default` value of your parameter in CloudFormation should match the default behaviour of your CDK app when the environment variable is unset, to avoid potential confusion.

Where exactly you read the environment variable from in your CDK code is a question of design - but we've made it an explicit prop of the `CdkProjectStack` (in [lib/stack.ts](lib/stack.ts)) and set that in the top level entry point script [bin/app.ts](bin/app.ts), which keeps things a bit more transparent than having arbitrary constructs or resources in your `lib` reading from environment variables.


### Publishing output values

By default, any [`CfnOutput`](https://docs.aws.amazon.com/cdk/api/v2/docs/aws-cdk-lib.CfnOutput.html) you create in your CDK app will appear on the *stack deployed by CDK* but **not** on the "bootstrap" stack that's running the CodeBuild. You may like to re-publish a CDK output (like a deployed resource URL or name) on the bootstrap stack as well, so your consumers have an easier time finding it.

To do this:

1. In [cdk.json](cdk.json), we set `"outputsFile": "cdk.outputs.json"` to tell CDK to save deployed stack outputs to file after deployment.
    - We also [gitignore](.gitignore) `cdk.outputs.json`, since the contents are deployment-specific so you probably don't want to check them in to your source control.
2. In the `cfn_bootstrap.yml`, create your `Outputs` like our `ExampleQueueArn`.

cdk.outputs.json, when generated by a successful CDK deployment, will contain the outputs of your CDK-created stacks in nested JSON format:

```json
{
  "YourStackName": {
    "YourOutputName": "ValueOfTheOutput"
  }
}
```

Our CodeBuild template reads this file, if present, and publishes the contents as attributes of the CloudFormation resource that represents the actual deployment: `SampleDeployment`. You can reference these with e.g. `Value: !GetAtt SampleDeployment.{YourStackName}.{YourStackOutputName}`, either to publish them as outputs on the bootstrap stack - or even to create multiple deployments in one bootstrap stack that depend on outputs of each other.


### Required permissions and security considerations

The `CodeBuildServiceRole` created in cfn_bootstrap.yml is the role that will be used to deploy (and later, update or destroy) your CDK solution - so it needs all the relevant IAM permissions for those operations: Including for example to create and delete AWS CloudFormation stacks, as well as all the services that'll be set up (like SQS in our case). Bootstrapping CDK, in particular, [recommends very broad permissions](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html#bootstrapping-env-permissions) which we've already attempted to scope down a bit further in this sample.

*Your consumers* (who'll deploy the bootstrap stack to their accounts), will need the permissions required by the bootstrap stack itself: Including CloudFormation, CodeBuild, and access to **create the IAM `CodeBuildServiceRole`**.

As a result, some key considerations include:

1. Your created CodeBuild project will likely be quite privileged.
    - Try to minimize its permissions to only the ones your CDK solution needs (the same minimal set for developers to be able to deploy it). We've provided an example policy `SQSExampleDeploymentPerms`, and commented-out broader access you could consider using to initially debug deployment when working with new resource types.
    - Educate your consumers on the importance of restricting users' access *to the CodeBuild project* in their target AWS account.
2. Permissions to create IAM roles and policies are quite powerful, so many organizations restrict them. Check your consumers will have sufficient access to deploy the bootstrap stack.


### ⚠️ Other configurations and some important warnings

Your `Custom::CodeBuildTrigger` resource in the CloudFormation bootstrap has some other parameters with sensible defaults but that you might need to be aware of:

- `BuildOnDelete`: Set `true` (as we have) to run the `cdk destroy` command when the bootstrap stack is deleted. By default (`false`) deleting the bootstrap stack itself won't re-run the CodeBuild job and therefore won't delete the actual solution that the CDK deployed (our `CdkFromCloudFormationExample` stack).
- `CodeBuildCallback`: Set `true` (as we have) to **wait** for the CodeBuild project to run.
    - By default (`false`), the `SampleDeployment` resource would return `CREATE_COMPLETE` as soon as the CodeBuild job is started
    - ⚠️ You can **only** publish CDK outputs back to the bootstrap stack if this parameter is set to `true`
    - ⚠️ You can **only** set this parameter to `false` if your CDK deployment will take longer than 1 hour - otherwise CloudFormation will time out, treat the deployment as failed, and begin rolling back.
- `IgnoreUpdate`: Set `true` to **ignore** any `UPDATE` events. By default (`false`), updating the bootstrap stack *in a way that updates the input properties* of your `SampleDeployment` will re-trigger CodeBuild to run your `cdk deploy` again.


## Debugging

As a developer, you'll generally do most of your testing and debugging on the CDK app itself. The bootstrap CloudFormation template only needs to be touched when changing the set of configuration parameters or outputs that need to be exposed to your consumers through the one-click deployable CloudFormation.

When a bootstrap-driven deployment goes wrong, you'll typically see a `CREATE_FAILED` event on the resource that represents the actual deployment (`SampleDeployment` as we've named it), and the place to look for detailed error logs will be the CodeBuild project/build that was running the deployment script.

If you're deploying the bootstrap with rollback enabled (the default in CloudFormation), you might find this CodeBuild project was deleted already when you come to investigate. However, the logs should still be available in [CloudWatch log groups](https://console.aws.amazon.com/cloudwatch/home?#logsV2:log-groups) under `/aws/codebuild/{build-project-id}>{build UID}`. ⚠️ Note that you'll probably see two builds: the initial one triggered by the `CREATE` (likely the most interesting), and then the one triggered by CloudFormation's roll-back `DELETE` event.
