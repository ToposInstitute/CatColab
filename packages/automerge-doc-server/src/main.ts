import io from "socket.io-client";

const socket = io("http://localhost:3000");

socket.on("new_doc", (data: unknown) => {
    console.log("Received `new_doc`");
    console.log(data);
});
