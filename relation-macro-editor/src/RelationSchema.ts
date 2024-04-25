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
    parseDOM: [{ tag: 'p' }],
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

  box: {
    attrs: { ychange: { default: null } },
    content: 'inline*',
    group: 'block',
    parseDOM: [{ tag: 'p' }],
    toDOM (node) {
      return [
        'p',
        { class: 'box', ...calcYchangeDomAttrs(node.attrs) },
        [ 'i', {class: "fa-regular fa-square"} ],
        [ 'span', " " ],
        [ 'span', 0 ]
      ]
    }
  },

  text: {
    group: 'inline'
  }
}

export const marks = {}

export const schema = new Schema({ nodes, marks })
