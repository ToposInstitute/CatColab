import { makeTimer } from "@solid-primitives/timer";
import type { EChartsOption } from "echarts";
import { createMemo, createSignal, lazy } from "solid-js";
import invariant from "tiny-invariant";

const ECharts = lazy(() => import("./echarts"));

/** Data plotted by `PDEPlot2D` component. */
export type PDEPlotData2D = {
    /** Time values. */
    time: number[];

    /** Values of x-coordinate.  */
    x: number[];

    /** Values of y-coordinate. */
    y: number[];

    /** Values of the state variable over time. */
    state: Record<string, StateVarAtTime[]>;
};

/** The data of a state variable at a given time. */
type StateVarAtTime = Array<[xIndex: number, yIndex: number, value: number]>;

/** Display the output data from a 2D PDE simulation. */
export function PDEPlot2D(props: { data: PDEPlotData2D }) {
    // XXX: JavaScript is not stable under eta-equivalence.
    const min = (x: number, y: number) => Math.min(x, y);
    const max = (x: number, y: number) => Math.max(x, y);

    const firstState = (): StateVarAtTime[] => {
        // FIXME: Shouldn't just take the first one!
        const keys = Object.keys(props.data.state);
        invariant(keys.length === 1);
        const key = keys[0];
        const state = key && props.data.state[key];
        invariant(state);
        return state;
    };

    const minValue = createMemo<number>(() =>
        firstState()
            .map((data) => data.map((triple) => triple[2]).reduce(min))
            .reduce(min),
    );
    const maxValue = createMemo<number>(() =>
        firstState()
            .map((data) => data.map((triple) => triple[2]).reduce(max))
            .reduce(max),
    );

    const [timeIndex, setTimeIndex] = createSignal(0);

    // Animate the heat map by varying the time index to display.
    makeTimer(
        () => {
            const timeLength = props.data.time.length;
            setTimeIndex((timeIndex() + 5) % timeLength);
        },
        10,
        setInterval,
    );

    function options(idx: number): EChartsOption {
        return {
            xAxis: {
                type: "category",
                data: props.data.x,
            },
            yAxis: {
                type: "category",
                data: props.data.y,
            },
            visualMap: {
                min: minValue(),
                max: maxValue(),
                orient: "horizontal",
                left: "center",
                inRange: {
                    // Source for colors:
                    // https://echarts.apache.org/examples/en/editor.html?c=heatmap-large
                    color: [
                        "#313695",
                        "#4575b4",
                        "#74add1",
                        "#abd9e9",
                        "#e0f3f8",
                        "#ffffbf",
                        "#fee090",
                        "#fdae61",
                        "#f46d43",
                        "#d73027",
                        "#a50026",
                    ],
                },
            },
            series: [
                {
                    name: "Value",
                    type: "heatmap",
                    data: firstState()[idx],
                    emphasis: {
                        itemStyle: {
                            borderColor: "black",
                            borderWidth: 1,
                        },
                    },
                    progressive: false,
                    animation: false,
                },
            ],
        };
    }

    return (
        <div class="plot">
            <ECharts option={options(timeIndex())} />
        </div>
    );
}
