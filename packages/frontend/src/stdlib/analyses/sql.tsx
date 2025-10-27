// import type { JSX } from "solid-js";
import { ThSchema } from "catlog-wasm";
import download from "js-file-download";
import { Show } from "solid-js";

import type { ModelAnalysisProps } from "../../analysis";
import { IconButton } from "../../components";

import Download from "lucide-solid/icons/download";

// export function configureDownloadSQLAnalysis(options: {}) & ModelAnalysisMeta<_> {
//   const { id, name, description, help } = options;
//   return {
// 	id,
// 	name,
// 	description,
// 	help,
// 	component: (props) => </>,
// 	initialContent: {}
//   }
// }

// export default function DownloadSQL(props: {}) {
//     // const [ref, setRef] =  createSignal<string>();
// 	// const title = () => props.title ?? "";
//     console.log(props);
// 	// const title = () => "!";
// 	// const header = () => (
// 	//   <DownloadTextButton />
// 	// );
    
//     return (
// 		<div>
// 			<div class="text-box">
// 			</div>
// 		</div>
// 	)
// }


/** Button to download an SVG. */
export default function DownloadTextButton(props: ModelAnalysisProps<DownloadConfig>) {
	const thSchema = new ThSchema();  
    
	const downloadText = () => {
        downloadTextContent("!", 
										  // props.filename ?? 
											"export.sql");
    };

    return (
	  <div>
	  <Show when={props.liveModel.elaboratedModel()}>
        {(model) => (
		  <div>
		  <IconButton onClick={downloadText} disabled={false} tooltip={""}>
            <Download size={10} />
          </IconButton>
		  <pre>{thSchema.renderSql(model())}</pre>
		  </div>)}
	   </Show>
	  </div>
    );
}


export function downloadTextContent(text: string, filename: string) {
	return download(text, filename, "text/plain");
}

export type DownloadConfig = {
  backend: string;
  filename: string;
};

export const defaultDownloadConfig = (): DownloadConfig => ({
	backend: "MySQL",
	filename: "schema.sql"
});
