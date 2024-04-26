import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { createSignal, For } from 'solid-js'
import './App.css'

function PortRow(port: Y.Map<any>, deleteMe: () => void, junctions: () => Array<Y.Map<any>>) {
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
      <input type="text" value={name()} oninput={evt => port.set('name', evt.target.value)}></input>
    </td>
    <td>
      <select value={junction()} oninput={evt => port.set('junction', evt.target.value)}>
        <For each={junctions()}>
          {junction => {
            let [name, setName] = createSignal<string>('')
            junction.observe(_ => {
              setName(junction.get('name'))
            })
            setName(junction.get('name'))
            return (<option value={name()}>{name()}</option>)
          }}
        </For>
      </select>
    </td>
    <td class="trash">
      <button class="delete-port" onclick={_ => deleteMe()}><i class="fa-solid fa-trash"></i></button>
    </td>
  </tr>)
}

function PortTable(box: Y.Map<any>, junctions: () => Array<Y.Map<any>>) {
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
        <For each={ports()}>{
          (port, i) => PortRow(port, () => yports.delete(i()),junctions)
        }</For>
        <tr>
          <td class="plus">
            <button onclick={_ => newPort()}><i class="fa-solid fa-plus"></i></button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>)
}

function BoxEditor(box: Y.Map<any>, deleteMe: () => void, junctions: () => Array<Y.Map<any>>) {
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
          <input type="text" value={name()} oninput={evt => box.set('name', evt.target.value)}></input>
          {PortTable(box, junctions)}
        </div>
        <button onclick={_ => deleteMe()}><i class="fa-solid fa-trash"></i></button>
      </div>
    </li>
  )
}

function JunctionTable(junctions: () => Array<Y.Map<any>>, newJunction: () => void, deleteJunction: (i: number) => void) {
  return (<table class="junctions-table">
    <thead>
      <tr class="junctions-header"><th>Name</th><th>Exposed</th></tr>
    </thead>
    <tbody>
      <For each={junctions()}>
        {(item, i) => {
          let [text, setText] = createSignal<string>('')
          setText(item.get('name'))
          item.observe(_ => setText(item.get('name')))
          return (<tr>
            <td>
              <input type="text" value={text()} oninput={evt => item.set('name', evt.target.value)}></input>
            </td>
            <td>
              <input type="checkbox"></input>
            </td>
            <td class="trash">
              <button onclick={_ => deleteJunction(i())}><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>)
        }
        }
      </For>
      <tr>
        <td class="plus">
          <button onclick={_ => newJunction()}><i class="fa-solid fa-plus"></i></button>
        </td>
      </tr>
    </tbody>
  </table>)
}

function App() {
  const ydoc = new Y.Doc()

  const provider = new WebsocketProvider(
    'wss://demos.yjs.dev/ws', // use the public ws server
    // `ws${location.protocol.slice(4)}//${location.host}/ws`, // alternatively: use the local ws server (run `npm start` in root directory)
    'releditor6',
    ydoc
  )

  let yjunctions: Y.Array<Y.Map<any>> = ydoc.getArray('junctions')
  let yboxes: Y.Array<Y.Map<any>> = ydoc.getArray('boxes')

  const [boxes, setBoxes] = createSignal<Array<Y.Map<any>>>([])
  const [junctions, setJunctions] = createSignal<Array<Y.Map<any>>>([])

  yboxes.observe(_event => {
    setBoxes(yboxes.toArray())
  })

  yjunctions.observe(_event => {
    setJunctions(yjunctions.toArray())
  })

  provider.on('synced', () => {
    setBoxes(yboxes.toArray())
    setJunctions(yjunctions.toArray())
  })

  function newJunction() {
    let j = new Y.Map<any>()
    j.set('name', '')
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
    <>
      <h3>Junctions</h3>
      {JunctionTable(junctions, newJunction, deleteJunction)}
      <h3>Boxes</h3>
      <ul class="boxes">
        <For each={boxes()}>
          {(box, i) => BoxEditor(box, () => {yboxes.delete(i())}, junctions)}
        </For>
        <li class="addbox">
          <button onclick={_ => newBox()}><i class="fa-solid fa-plus"></i></button>
        </li>
      </ul>
    </>
  )
}

export default App
