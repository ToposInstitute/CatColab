import { Schema, NodeSpec, Attrs } from 'prosemirror-model'

const calcYchangeDomAttrs = (attrs: Attrs, domAttrs = {}) => {
  const newAttrs: any = Object.assign({}, domAttrs)
  if (attrs.ychange !== null) {
    newAttrs.ychange_user = attrs.ychange.user
    newAttrs.ychange_state = attrs.ychange.state
  }
  return newAttrs
}

export const nodes: Record<string, NodeSpec> = {
  doc: {
    content: 'block*'
  },

  junction: {
    attrs: { ychange: { default: null } },
    content: 'inline*',
    group: 'block',
    toDOM (node) {
      return [
        'p',
        { class: 'junction', ...calcYchangeDomAttrs(node.attrs) },
        [ 'i', {class: "fa-solid fa-circle"} ],
        [ 'span', " " ],
        [ 'span', 0 ]
      ]
    }
  },

  port: {
    attrs: { ychange: { default: null} },
    content: 'inline*',
    toDOM (_node) {
      return ['li', 0]
    }
  },

  boxname: {
    attrs: { ychange: { default: null } },
    content: 'inline*',
    toDOM (_node) {
      return ['span', 0]
    }
  },

  ports: {
    attrs: { ychange: { default: null } },
    content: 'port*',
    toDOM(_node) {
      return ['ul', 0]
    }
  },

  box: {
    attrs: { ychange: { default: null } },
    content: 'boxname ports',
    group: 'block',
    toDOM (node) {
      return [
        'p',
        { class: 'box', ...calcYchangeDomAttrs(node.attrs) },
        [ 'i', {class: "fa-regular fa-square"} ],
        [ 'span', " " ],
        [ 'div', 0 ]
      ]
    }
  },

  text: {
    group: 'inline'
  }
}

export const marks = {}

export const schema = new Schema({ nodes, marks })
