export type NewDocSocketResponse =
    | {
          Ok: {
              docId: string;
              docJson: any;
          };
      }
    | { Err: string };
export type StartListeningSocketResponse = { Ok: null } | { Err: string };
