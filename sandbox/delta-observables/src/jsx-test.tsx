declare global {
  namespace JSX {
    interface IntrinsicElements {
      div: any;
      // ... hundreds more
    }
  }
}

function createElement(tag: any, attrs: any, ...children: any) {
  return [tag, attrs, children];
}

function MyElt(props: { name: string }) {
  return <div>{props.name}</div>;
}

export const elt = <MyElt name="owen" />;
