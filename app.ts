import { App } from "aws-cdk-lib";
import { CustomIntrinsics } from "./stack";

new CustomIntrinsics(new App(), "CustomIntrinsics");
