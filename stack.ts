import {
  type App,
  type CfnResource,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import {
  NodejsFunction,
  type NodejsFunctionProps,
  OutputFormat,
} from "aws-cdk-lib/aws-lambda-nodejs";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";
import {
  DefinitionBody,
  LogLevel,
  Pass,
  StateMachine,
  StateMachineType,
} from "aws-cdk-lib/aws-stepfunctions";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";

class LlrtFunction extends NodejsFunction {
  constructor(scope: Stack, id: string, props: NodejsFunctionProps) {
    super(scope, id, {
      ...props,
      architecture: Architecture.ARM_64,
      awsSdkConnectionReuse: false,
      bundling: {
        ...props.bundling,
        commandHooks: {
          afterBundling: (i, o) => [
            `if [ ! -e ${i}/llrt/bootstrap ]; then
              mkdir -p ${i}/llrt
              cd ${i}/llrt
              curl -L -o llrt.zip https://github.com/awslabs/llrt/releases/latest/download/llrt-lambda-arm64.zip
              unzip llrt.zip
              rm -rf llrt.zip
            fi`,
            `cp ${i}/llrt/bootstrap ${o}/`,
          ],
          beforeBundling: (_i, _o) => [],
          beforeInstall: (_i, _o) => [],
        },
        format: OutputFormat.ESM,
        minify: true,
        sourceMap: true,
        target: "es2020",
      },
      environment: {
        ...props.environment,
        NODE_OPTIONS: "--enable-source-maps",
      },
    });

    (this.node.defaultChild as CfnResource).addPropertyOverride(
      "Runtime",
      Runtime.PROVIDED_AL2023.name,
    );
  }
}

export class CustomIntrinsics extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props);

    const date = new LambdaInvoke(this, "Date", {
      lambdaFunction: new LlrtFunction(this, "InstrinsicFn-Date", {
        entry: "./intrinsics/date.ts",
        functionName: "InstrinsicFn-Date",
      }),
      resultPath: "$.taskResults.Date",
      resultSelector: { "date.$": "$.Payload" },
    });

    const nanoid = new LambdaInvoke(this, "Nanoid", {
      lambdaFunction: new LlrtFunction(this, "InstrinsicFn-Nanoid", {
        entry: "./intrinsics/nanoid.ts",
        functionName: "InstrinsicFn-Nanoid",
      }),
      resultPath: "$.taskResults.Nanoid",
      resultSelector: { "nanoid.$": "$.Payload" },
    });

    const ulid = new LambdaInvoke(this, "Ulid", {
      lambdaFunction: new LlrtFunction(this, "InstrinsicFn-Ulid", {
        entry: "./intrinsics/ulid.ts",
        functionName: "InstrinsicFn-Ulid",
      }),
      resultPath: "$.taskResults.Ulid",
      resultSelector: { "ulid.$": "$.Payload" },
    });

    const hello = new LambdaInvoke(this, "Hello", {
      lambdaFunction: new LlrtFunction(this, "HelloFn", {
        entry: "./functions/hello.ts",
        functionName: "Hello",
      }),
      resultPath: "$.taskResults.Hello",
      resultSelector: { "hello.$": "$.Payload" },
    });

    new StateMachine(this, "CustomInstrinsics", {
      definitionBody: DefinitionBody.fromChainable(
        date.next(nanoid).next(ulid).next(hello),
      ),
      logs: {
        destination: new LogGroup(this, "CustomInstrinsics-Logs", {
          logGroupName: "/aws/vendedlogs/states/CustomInstrinsics",
          removalPolicy: RemovalPolicy.DESTROY,
          retention: RetentionDays.ONE_DAY,
        }),
        includeExecutionData: true,
        level: LogLevel.ALL,
      },
      stateMachineName: "CustomInstrinsics",
      stateMachineType: StateMachineType.EXPRESS,
    });
  }
}
