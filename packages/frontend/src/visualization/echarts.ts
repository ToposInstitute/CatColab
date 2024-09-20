/** Wrapper module around `echarts-solid` to facilitate lazy loading.

@module
 */

// XXX: Prevent echarts from being tree-shaken:
// https://apache.github.io/echarts-handbook/en/basics/import/
import * as echarts from "echarts";
echarts;

import { EChartsAutoSize } from "echarts-solid";

export default EChartsAutoSize;
