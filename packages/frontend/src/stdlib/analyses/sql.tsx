// import type { JSX } from "solid-js";
import { ThSchema } from "catlog-wasm";
import download from "js-file-download";
import { createSignal, Show } from "solid-js";

import { DropdownMenu } from "@kobalte/core/dropdown-menu";

import type { ModelAnalysisProps } from "../../analysis";
import { IconButton } from "../../components";

import MenuIcon from "lucide-solid/icons/menu";
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

export const MenuItem = DropdownMenu.Item;
export const MenuItemLabel = DropdownMenu.ItemLabel;
export const MenuSeparator = DropdownMenu.Separator;

/** Button to download an SVG. */
export default function DownloadTextButton(props: ModelAnalysisProps<DownloadConfig>) {
	const thSchema = new ThSchema();  
   
	// TODO SQLite can be an invalid change
	const [backend, setBackend] = createSignal("mysql");
	const sqlOutput = () => {
        const model = props.liveModel.elaboratedModel();
        return model ? thSchema.renderSql(model, backend()) : null;
	};
	const downloadText = (text: string) => {
        downloadTextContent(text, 
										  // props.filename ?? 
											"export.sql");
    };
    return (
	  <div>
	  <DropdownMenu modal={false}>
            <DropdownMenu.Trigger as={IconButton} disabled={false}>
                <MenuIcon />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
                <DropdownMenu.Content class="menu popup">
					<MenuItem onSelect={() => setBackend('mysql')}>
						<MenuItemLabel>{"MySQL"}</MenuItemLabel>
					</MenuItem>
					<MenuItem onSelect={() => setBackend('sqlite')}>
						<MenuItemLabel>{"SQLite"}</MenuItemLabel>
					</MenuItem>
					<MenuItem onSelect={() => setBackend('postgres')}>
						<MenuItemLabel>{"PostgresSQL"}</MenuItemLabel>
					</MenuItem>
				</DropdownMenu.Content>
            </DropdownMenu.Portal>
        </DropdownMenu>
	  <Show when={sqlOutput()}>
        {(sql) => (
		  <div>
		  <IconButton onClick={() => downloadText(sql())} disabled={false} tooltip={""}>
            <Download size={10} />
          </IconButton>
		  <span>{backend()}</span>
		  <pre>{sql()}</pre>
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
