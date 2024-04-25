import './prosemirror.css'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, undo, redo } from 'y-prosemirror'
import { EditorView } from 'prosemirror-view'
import { EditorState, Command, TextSelection } from 'prosemirror-state'
import { MenuItem, menuBar } from 'prosemirror-menu'
import { keymap } from 'prosemirror-keymap'
import { schema } from './RelationSchema'

const junctionEl = document.createElement("i")
junctionEl.classList.add("fa-solid", "fa-circle")

const boxEl = document.createElement("i")
boxEl.classList.add("fa-regular", "fa-square")

function addNode(type: string): Command {
  return (state, dispatch) => {
    let tr = state.tr
    let n = tr.doc.content.size
    tr.insert(n, schema.node(type, null, []))
    tr.setSelection(TextSelection.create(tr.doc, n+1))
    if (dispatch) {
      dispatch(tr)
    }
    return true
  }
}

const InsertJunction = new MenuItem({
  title: "Add Junction",
  label: "Junction",
  icon: { dom: junctionEl },
  run: addNode("junction")
})

const InsertBox = new MenuItem({
  title: "Add Box",
  label: "Box",
  icon: { dom: boxEl },
  run: addNode("box")
})

const deleteCurrent: Command = (state, dispatch) => {
  let tr = state.tr

  let anchor = state.selection.$anchor

  if (anchor.parent.childCount >= 1) {
    tr.delete(anchor.pos-1, anchor.pos)
  } else {
    tr.delete(anchor.before(), anchor.after())
    tr.setSelection(TextSelection.create(tr.doc, anchor.before()-1))
  }

  if (dispatch) {
    dispatch(tr)
  }
  return true
}

const clone: Command = (state, dispatch) => {
  let tr = state.tr

  let anchor = state.selection.$anchor

  let newNode = schema.node(anchor.parent.type.name, null, [])

  tr.insert(anchor.after(), newNode)
  tr.setSelection(TextSelection.create(tr.doc, anchor.after()+1))

  if (dispatch) {
    dispatch(tr)
  }
  return true
}

function App() {
  const ydoc = new Y.Doc()

  const provider = new WebsocketProvider(
    'wss://demos.yjs.dev/ws', // use the public ws server
    // `ws${location.protocol.slice(4)}//${location.host}/ws`, // alternatively: use the local ws server (run `npm start` in root directory)
    'codemirror.next-demo',
    ydoc
  )

  const pm = ydoc.get('my-special-session', Y.XmlFragment)

  const onmount = (el: Element) => {
    new EditorView(el, {
      state: EditorState.create({
        schema,
        plugins: [
            ySyncPlugin(pm),
            yCursorPlugin(provider.awareness),
            yUndoPlugin(),
            keymap({
              'Mod-z': undo,
              'Mod-y': redo,
              'Mod-Shift-z': redo,
              'Backspace': deleteCurrent,
              'Enter': clone
            }),
            menuBar({ content: [[InsertJunction, InsertBox]]})
          ]
      })
    })
  }

  return (
    <>
      <div ref={onmount}></div>
    </>
  )
}

export default App
