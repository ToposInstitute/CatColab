import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { createSignal, For } from 'solid-js'
import './App.css'
import { UWD } from './UWD'

function PortRow(
  port: Y.Map<any>,
  deleteMe: () => void,
  junctions: () => Array<Y.Map<any>>
) {
  let [name, setName] = createSignal<string>('')
  let [junction, setJunction] = createSignal<string>('')
  setName(port.get('name'))
  setJunction(port.get('junction'))
  port.observe(_ => {
    setName(port.get('name'))
    setJunction(port.get('junction'))
  })
  return (<tr>
    <td>
      <input
        type="text"
        value={name()}
        oninput={
          evt => port.set('name', evt.target.value)
        }>
      </input>
    </td>
    <td>
      <select oninput={evt => port.set('junction', evt.target.value)}>
        <For each={junctions()}>
          {yjunction => {
            let [name, setName] = createSignal<string>('')
            yjunction.observe(_ => {
              setName(yjunction.get('name'))
            })
            setName(yjunction.get('name'))
            return (<option selected={junction()==name()} value={name()}>{name()}</option>)
          }}
        </For>
      </select>
    </td>
    <td class="trash">
      <button class="delete-port" onclick={_ => deleteMe()}>
        <i class="fa-solid fa-trash"></i>
      </button>
    </td>
  </tr>)
}

function PortTable(
  box: Y.Map<any>,
  junctions: () => Array<Y.Map<any>>
) {
  let [ports, setPorts] = createSignal<Array<Y.Map<any>>>([])
  let yports: Y.Array<Y.Map<any>> = box.get('ports')
  setPorts(yports.toArray())
  yports.observe(_ => {
    setPorts(yports.toArray())
  })
  function newPort() {
    let p = new Y.Map<any>()
    p.set('name', '')
    let js = junctions()
    if (js.length >= 0) {
      p.set('junction', js[0].get('name'))
    } else {
      p.set('junction', null)
    }
    yports.push([p])
  }
  return (<div>
    <table class="port-table">
      <thead>
        <tr><th>Port name</th><th>Junction</th></tr>
      </thead>
      <tbody>
        <For each={ports()}>
          {(port, i) =>
            PortRow(port, () => yports.delete(i()),junctions)
          }
        </For>
        <tr>
          <td class="plus">
            <button onclick={_ => newPort()}>
              <i class="fa-solid fa-plus"></i>
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>)
}

function BoxEditor(
  box: Y.Map<any>,
  deleteMe: () => void,
  junctions: () => Array<Y.Map<any>>
) {
  let [name, setName] = createSignal<string>('')
  setName(box.get('name'))
  box.observe(_ => {
    setName(box.get('name'))
  })
  return (
    <li>
      <div class="box-editor">
        <div class="box-content">
          <span><strong>Name: </strong></span>
          <input
            type="text"
            value={name()}
            oninput={evt => box.set('name', evt.target.value)}>
          </input>
          {PortTable(box, junctions)}
        </div>
        <button onclick={_ => deleteMe()}>
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </li>
  )
}

function JunctionTable(
  junctions: () => Array<Y.Map<any>>,
  newJunction: () => void,
  deleteJunction: (i: number) => void
) {
  return (<table class="junctions-table">
    <thead>
      <tr class="junctions-header">
        <th>Name</th>
        <th>Exposed</th>
      </tr>
    </thead>
    <tbody>
      <For each={junctions()}>
        {(item, i) => {
          let [text, setText] = createSignal<string>('')
          let [exposed, setExposed] = createSignal<boolean>(false)
          setText(item.get('name'))
          setExposed(item.get('exposed'))
          item.observe(_ => {
            setText(item.get('name'))
            setExposed(item.get('exposed'))
          })
          return (<tr>
            <td>
              <input
                type="text"
                value={text()}
                oninput={
                  evt => item.set('name', evt.target.value)
                }>
              </input>
            </td>
            <td>
              <input
                type="checkbox"
                checked={exposed() as boolean}
                oninput={
                  evt => item.set('exposed', evt.target.checked)
                }>
              </input>
            </td>
            <td class="trash">
              <button onclick={_ => deleteJunction(i())}>
                <i class="fa-solid fa-trash"></i>
              </button>
            </td>
          </tr>)
        }
        }
      </For>
      <tr>
        <td class="plus">
          <button onclick={_ => newJunction()}>
            <i class="fa-solid fa-plus"></i>
          </button>
        </td>
      </tr>
    </tbody>
  </table>)
}

function StructureEditor(
  yboxes: Y.Array<Y.Map<any>>,
  yjunctions: Y.Array<Y.Map<any>>,
  onsynced: (cb: () => void) => void
) {
  const [boxes, setBoxes] = createSignal<Array<Y.Map<any>>>([])
  const [junctions, setJunctions] = createSignal<Array<Y.Map<any>>>([])

  yboxes.observe(_event => {
    setBoxes(yboxes.toArray())
  })

  yjunctions.observe(_event => {
    setJunctions(yjunctions.toArray())
  })

  onsynced(() => {
    setBoxes(yboxes.toArray())
    setJunctions(yjunctions.toArray())
  })

  function newJunction() {
    let j = new Y.Map<any>()
    j.set('name', '')
    j.set('exposed', 'false')
    yjunctions.push([j])
  }

  function deleteJunction(i: number) {
    yjunctions.delete(i)
  }

  function newBox() {
    let b = new Y.Map<any>()
    let ports = new Y.Array<Y.Map<any>>()
    b.set('name', '')
    b.set('ports', ports)
    yboxes.push([b])
  }

  return (
    <div class="structure-editor">
      <h2>Editor</h2>
      <h3>Junctions</h3>
      {JunctionTable(junctions, newJunction, deleteJunction)}
      <h3>Boxes</h3>
      <ul class="boxes">
        <For each={boxes()}>
          {(box, i) =>
            BoxEditor(box, () => {yboxes.delete(i())}, junctions)
          }
        </For>
        <li class="addbox">
          <button onclick={_ => newBox()}>
            <i class="fa-solid fa-plus"></i>
          </button>
        </li>
      </ul>
    </div>
  )
}

function Display(
  yboxes: Y.Array<any>,
  yjunctions: Y.Array<any>,
  onsynced: (cb: () => void) => void
) {
  let el: Element
  function refresh() {
    el.innerHTML = ''
    el.appendChild(
      UWD(yboxes.toArray(), yjunctions.toArray())
    )
  }
  onsynced(refresh)
  return (
    <div class="display">
      <h2>Viewer</h2>
      <button onclick={_ => refresh()}><i class="fa-solid fa-refresh"></i></button>
      <div ref={thediv => {el = thediv}}>
      </div>
    </div>
  )
}

type OnSynced = (cb: () => void) => void

function EditorViewer(name: string) {
  const ydoc = new Y.Doc()

  const provider = new WebsocketProvider(
    'wss://demos.yjs.dev/ws', // use the public ws server
    // `ws${location.protocol.slice(4)}//${location.host}/ws`, // alternatively: use the local ws server (run `npm start` in root directory)
    name,
    ydoc
  )

  let yjunctions: Y.Array<Y.Map<any>> = ydoc.getArray('junctions')
  let yboxes: Y.Array<Y.Map<any>> = ydoc.getArray('boxes')

  let onsynced: OnSynced = cb => provider.on('synced', cb)

  return (
    <>
      {StructureEditor(
        yboxes,
        yjunctions,
        onsynced
      )}
      {Display(yboxes, yjunctions, onsynced)}
    </>
  )
}

function App() {
  const ydoc = new Y.Doc()

  const provider = new WebsocketProvider(
    'wss://demos.yjs.dev/ws', // use the public ws server
    // `ws${location.protocol.slice(4)}//${location.host}/ws`, // alternatively: use the local ws server (run `npm start` in root directory)
    'relation-macro-editor-saves',
    ydoc
  )

  let ysaves: Y.Map<null> = ydoc.getMap('saves')

  ysaves.set('default', null)
  ysaves.set('other', null)

  let [saves, setSaves] = createSignal<Map<string, null>>(new Map())

  function updateSaves() {
    let newSaves = new Map()
    for (let k of ysaves.keys()) {
      newSaves.set(k, null)
    }
    setSaves(newSaves)
  }

  ysaves.observe(_ => {
    updateSaves()
  })

  provider.on('synced', () => {
    updateSaves()
  })

  let [current, setCurrent] = createSignal<string>('default')

  let [newName, setNewName] = createSignal<string>('')

  return (
    <div class="app">
      <div class="saves">
        <h2>Workspace</h2>
        <div class="newfile">
          <input
            type="text"
            value={newName()}
            onchange={evt => setNewName(evt.target.value)}>
          </input>
          <button onclick={_ =>
            ysaves.set(newName(), null)
          }><i class="fa-solid fa-plus"></i></button>
        </div>
        <table class="workspace-table">
          <tbody>
          <For each={[...(saves() as Map<string, null>).keys()]}>
            {save =>
              <tr>
                <td>
                  <i class="fa-solid fa-file"></i>
                  <span> </span>
                  <a onclick={_ => setCurrent(save)}>{save}</a>
                  {current() == save &&
                    <>
                      <span> </span>
                      <i class="fa-solid fa-pen"></i>
                    </>}
                </td>
                <td>
                <button onclick={_ => ysaves.delete(save)}>
                  <i class="fa-solid fa-trash"></i>
                </button>
                </td>
              </tr>
            }
          </For>
          </tbody>
        </table>
      </div>
      {EditorViewer(current())}
    </div>
  )
}

export default App
