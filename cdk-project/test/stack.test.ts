// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// External Dependencies:
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as CdkProject from "../lib/stack";

// An example test for our simple demo stack:
test("SQS Queue Created", () => {
  const app = new cdk.App();
  // WHEN
  const stack = new CdkProject.CdkProjectStack(app, "MyTestStack");
  // THEN
  const template = Template.fromStack(stack);
  template.hasResourceProperties("AWS::SQS::Queue", {
    VisibilityTimeout: 300,
  });
});
