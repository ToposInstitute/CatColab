import * as Y from 'yjs'
// @ts-ignore
import { yCollab } from 'y-codemirror.next'
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { basicSetup } from "codemirror"
import { createTheme, CreateThemeOptions } from "@uiw/codemirror-themes"
import { tags as t } from '@lezer/highlight';
import { config as c } from './light-color';
import { WebsocketProvider } from 'y-websocket'
import './Doc.css'

export const defaultSettingsSolarizedLight: CreateThemeOptions['settings'] = {
  background: c.background,
  foreground: c.foreground,
  caret: c.cursor,
  selection: c.selection,
  selectionMatch: c.selectionMatch,
  gutterBackground: c.background,
  gutterForeground: c.foreground,
  gutterBorder: 'transparent',
  lineHighlight: c.activeLine,
};

export const solarizedLightInit = (options?: Partial<CreateThemeOptions>) => {
  const { theme = 'light', settings = {}, styles = [] } = options || {};
  return createTheme({
    theme: theme,
    settings: {
      ...defaultSettingsSolarizedLight,
      ...settings,
    },
    styles: [
      { tag: t.keyword, color: c.keyword },
      { tag: [t.name, t.deleted, t.character, t.macroName], color: c.variable },
      { tag: [t.propertyName], color: c.function },
      { tag: [t.processingInstruction, t.string, t.inserted, t.special(t.string)], color: c.string },
      { tag: [t.function(t.variableName), t.labelName], color: c.function },
      { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: c.constant },
      { tag: [t.definition(t.name), t.separator], color: c.variable },
      { tag: [t.className], color: c.class },
      { tag: [t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: c.number },
      { tag: [t.typeName], color: c.type, fontStyle: c.type },
      { tag: [t.operator, t.operatorKeyword], color: c.keyword },
      { tag: [t.url, t.escape, t.regexp, t.link], color: c.regexp },
      { tag: [t.meta, t.comment], color: c.comment },
      { tag: t.tagName, color: c.tag },
      { tag: t.strong, fontWeight: 'bold' },
      { tag: t.emphasis, fontStyle: 'italic' },
      { tag: t.link, textDecoration: 'underline' },
      { tag: t.heading, fontWeight: 'bold', color: c.heading },
      { tag: [t.atom, t.bool, t.special(t.variableName)], color: c.variable },
      { tag: t.invalid, color: c.invalid },
      { tag: t.strikethrough, textDecoration: 'line-through' },
      ...styles,
    ],
  });
};

export const solarizedLight = solarizedLightInit();

export function Doc() {
    const ydoc = new Y.Doc()

    const provider = new WebsocketProvider(
        'wss://demos.yjs.dev/ws', // use the public ws server
        // `ws${location.protocol.slice(4)}//${location.host}/ws`, // alternatively: use the local ws server (run `npm start` in root directory)
        'codemirror.next-demo',
        ydoc
    )

    const ytext = ydoc.getText('codemirror')

    provider.awareness.setLocalStateField('user', {
        name: 'LocalCharts',
        color: '#30bced',
    })

    const state = EditorState.create({
        doc: ytext.toString(),
        extensions: [
            basicSetup,
            solarizedLight,
            yCollab(ytext, provider.awareness)
        ]
    })

    return(
        <div class="editor" ref={el => new EditorView({ state, parent: el })}> </div>
    )
}
