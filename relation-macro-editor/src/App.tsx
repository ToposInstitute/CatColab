import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { createSignal, For } from 'solid-js'

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

  function newBox() {
    let b = new Y.Map<any>()
    let ports = new Y.Array<Y.Map<any>>()
    b.set('name', '')
    b.set('ports', ports)
    yboxes.push([b])
  }

  return (
    <>
      <div>Hello World</div>
      <h3>Junctions</h3>
      <button onclick={_ => newJunction()}>Add Junction</button>
      <button onclick={_ => yjunctions.delete(yjunctions.length-1)}>Delete Junction</button>
      <ul>
        <For each={junctions()}>
          {item => {
            let [text, setText] = createSignal<string>('')
            setText(item.get('name'))
            item.observe(_ => setText(item.get('name')))
            return (<li>
              <input type="text" value={text()} oninput={evt => item.set('name', evt.target.value)}></input>
            </li>)
          }
          }
        </For>
      </ul>
      <h3>Boxes</h3>
      <button onclick={_ => newBox()}>Add Box</button>
      <button onclick={_ => yboxes.delete(yboxes.length-1)}>Delete Box</button>
      <button onclick={_ => yboxes.delete(0, yboxes.length)}>Delete all boxes</button>
      <ul>
        <For each={boxes()}>
          {box => {
            let [name, setName] = createSignal<string>('')
            let [ports, setPorts] = createSignal<Array<Y.Map<any>>>([])
            let yports: Y.Array<Y.Map<any>> = box.get('ports')
            setName(box.get('name'))
            setPorts(yports.toArray())
            box.observe(_ => {
              setName(box.get('name'))
            })
            yports.observe(_ => {
              setPorts(yports.toArray())
            })
            function newPort() {
              let p = new Y.Map<any>()
              p.set('name', '')
              let js = yjunctions.toArray()
              if (js.length >= 1) {
                p.set('junction', js[0].get('name'))
              } else {
                p.set('junction', null)
              }
              yports.push([p])
            }
            function removePort() {
              yports.delete(yports.length - 1)
            }
            return (
              <li>
                <div class="boxeditor">
                  <input type="text" value={name()} oninput={evt => box.set('name', evt.target.value)}></input>
                  <button onclick={_ => newPort()}>Add Port</button>
                  <button onclick={_ => removePort()}>Remove Port</button>
                  <ul>
                    <For each={ports()}>
                      {port => {
                        let [name, setName] = createSignal<string>('')
                        let [junction, setJunction] = createSignal<string>('')
                        setName(port.get('name'))
                        setJunction(port.get('junction'))
                        port.observe(_ => {
                          setName(port.get('name'))
                          setJunction(port.get('junction'))
                        })
                        return (<li>
                          <input type="text" value={name()} oninput={evt => port.set('name', evt.target.value)}></input>
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
                        </li>)
                      }}
                    </For>
                  </ul>
                </div>
              </li>
            )
          }}</For>
      </ul>
    </>
  )
}

export default App
