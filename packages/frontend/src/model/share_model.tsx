import { RefDoc } from '../../../backend/pkg/src/RefDoc';
import { Doc, DocHandle } from "@automerge/automerge-repo";
import Dialog from "@corvu/dialog"
import {SocketServer } from '../../../../infrastructure/socket';
import { IconButton } from '../components';
import { Copy, Icon, Link2 } from 'lucide-solid';




export function sharingLink(props: { Ref: RefDoc, socketServer: SocketServer, linktoShare: string }) {
    let copied = false;
    const doctoShare = props.socketServer.autosave;
    console.log(doctoShare)
  async function copy(doctoShare: string) {
        try {
            await navigator.clipboard.writeText(doctoShare);
            if (!copied) {
                copied = true;
                setTimeout(() => (copied = false), 2000);
            }
        } catch (error: any) {
            alert(error.message);
        }
    }
}

export function sharingLinkPopup(props: {sharingLink: any}) {
    return (
        <Dialog>
            <Dialog.Trigger />
            <Dialog.Portal>
                <Dialog.Overlay />
                <Dialog.Content>
                    Share model 
                    <Link2 onClick={() => sharingLink({ Ref: props.sharingLink.Ref, socketServer: props.sharingLink.socketServer, linktoShare: props.sharingLink.linktoShare })} />
                    <Dialog.Close />
                    <Dialog.Label />
                    <Dialog.Description />
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog>
    )
}