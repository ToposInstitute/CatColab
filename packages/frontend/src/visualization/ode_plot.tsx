import type { EChartsOption } from "echarts";
import { Match, Switch, lazy } from "solid-js";

import type { JsResult } from "catlog-wasm";
import { ErrorAlert } from "../components";

const ECharts = lazy(() => import("./echarts"));

/** Data plotted by `ODEPlot` component. */
export type ODEPlotData = {
    time: number[];
    states: StateVarData[];
};

/** Values of a state variable over time. */
type StateVarData = {
    name: string;
    data: number[];
};

/** Display the results from an ODE simulation.

Plots the output data if the simulation was successful and shows an error
message otherwise.
 */
export function ODEResultPlot(props: {
    result?: JsResult<ODEPlotData, string>;
	colors?: Map<string, string>;
}) {
    return (
        <Switch>
            <Match when={props.result?.tag === "Ok" && props.result.content}>
                {(data) => <ODEPlot data={data()} colors={props.colors} />}
            </Match>
            <Match when={props.result?.tag === "Err" && props.result.content}>
                {(err) => <ErrorAlert title="Integration error">{err()}</ErrorAlert>}
            </Match>
        </Switch>
    );
}

/** Plot the output data from an ODE simulation. */
export function ODEPlot(props: {
    data: ODEPlotData;
}) {
    console.log(props.data.states);
    const options = (): EChartsOption => ({
        legend: {
            data: props.data.states.map((state) => state.name),
        },
        xAxis: {
            name: "time",
            data: props.data.time,
            axisLabel: {
                formatter: (_: string, i: number) => {
                    const x = props.data.time[i];
                    return x ? formatTimeLabel(x) : "";
                },
            },
        },
        yAxis: {
            type: "value",
        },
        series: props.data.states.map((state) => ({
            name: state.name,
            data: state.data,
            type: "line",
            symbol: "none",
			color: state.color.toLowerCase(),
        })),
    });

    return (
        <div class="plot">
            <ECharts option={options()} />
        </div>
    );
}

const formatTimeLabel = (x: number): string => {
    const label = x.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
    });
    /// XXX: Hack to get some extra padding.
    return ` ${label} `;
};
