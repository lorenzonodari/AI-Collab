const express = require("express");
const app = express();

const commander = require('commander');

commander
  .version('1.0.0', '-v, --version')
  .usage('[OPTIONS]...')
  .option('--address <value>', 'IP address', '172.17.15.69')
  .option('--port <number>', 'Port', 4000)
  .option('--log_messages', 'Log messages')
  .option('--log_key_pressing', 'Log key pressing')
  .option('--log_output', 'Log output from simulator')
  .parse(process.argv);

const command_line_options = commander.opts();

let broadcaster;
let simulator;
var map_config;
const port = parseInt(command_line_options.port);
const host = command_line_options.address;//'172.17.15.69'; //'localhost';

const https = require("https");

const fs = require("fs");


var today = new Date();
var date = today.getFullYear()+'_'+(today.getMonth()+1)+'_'+today.getDate();
var time = today.getHours() + "_" + today.getMinutes() + "_" + today.getSeconds();
var dateTime = date+'_'+time;

// Creating object of key and certificate
// for SSL
const options = {
  key: fs.readFileSync("server.key"),
  cert: fs.readFileSync("server.cert"),
};
  
// Creating https server by passing
// options and app object
const server = https.createServer(options, app)
.listen(port,host, function (req, res) {
  console.log(`Server is running on port ${port}`);
});
//const server = https.createServer(app);

const io = require("socket.io")(server);
app.use(express.static(__dirname + "/public"));



const { exec } = require("child_process");
var window_name = '';

var char_replacement = [{'Up':'Up','Down':'Down','Left':'Left','Right':'Right'},{'Up':'W','Down':'S','Left':'A','Right':'D'}];
var clients_ids = [], user_ids_list = [], ai_ids_list = [], ai_ids = [], all_ids = [], all_ids_list = [];
var init_xdotool = false;
var video_idx_broadcaster = 0;


function socket_to_simulator_id(socket_id){
  return all_ids_list[all_ids.indexOf(socket_id)];
}

function simulator_id_to_socket(simulator_id){
  return all_ids[all_ids_list.indexOf(simulator_id)];
}

io.sockets.on("error", e => console.log(e));
io.sockets.on("connection", socket => { //When a client connects
  socket.on("broadcaster_load", () => {
    console.log("broadcaster_log", video_idx_broadcaster, socket.id)
    socket.emit("simulator", video_idx_broadcaster);
  });

  socket.on("broadcaster", () => { //When the broadcaster client connects
    broadcaster = socket.id;
    socket.broadcast.emit("broadcaster");
    
    /*  
    //Initiate key press forwarding to the simulator through xdotool by getting the simulators window name
    if(! init_xdotool){
        exec('xdotool search --name TDW', (error, stdout, stderr) => {
            console.log("window_name: " + stdout);
            window_name = stdout.trim();
        });
        init_xdotool = true;
    }
    */
  });

  socket.on("watcher", (client_number) => { //When a human client connects

    socket.to(broadcaster).emit("watcher", socket.id, client_number);

    if(client_number != 0){
        clients_ids[client_number-1] = socket.id;
        all_ids[client_number-1] = socket.id;
        
        
        socket.emit("watcher", user_ids_list[client_number-1], map_config);
    }
        
    
    /*
    if (clients_ids.includes(socket.id) == false){
        clients_ids.push(socket.id);
        all_ids.push(socket.id);
    }
    */
  });
  socket.on("watcher_ai", (client_number, use_occupancy, server_address, view_radius, centered) => { //When an ai client connects
    console.log("watcher_ai")
    
    if(client_number != 0){
    
        if(! use_occupancy){
            client_number_adapted = client_number + user_ids_list.length;
            socket.to(broadcaster).emit("watcher_ai", socket.id, client_number_adapted, server_address, ai_ids_list[client_number-1]);
        } else {
            socket.to(simulator).emit("watcher_ai", ai_ids_list[client_number-1], view_radius, centered)
        }
        ai_ids[client_number-1] = socket.id;
        all_ids[client_number-1+user_ids_list.length] = socket.id;

        socket.emit("watcher_ai", ai_ids_list[client_number-1], map_config);
        /*
        if (ai_ids.includes(socket.id) == false){
            ai_ids.push(socket.id);
            all_ids.push(socket.id);
        }
        */
    }

  });


  socket.on("occupancy_map", (client_number, object_type_coords_map, object_attributes_id, objects_held) => { //Occupancy maps forwarding
    //console.log(`Sending to ${client_number}`);
    if(client_number != 0){
        socket.to(all_ids[client_number]).emit("occupancy_map", object_type_coords_map, object_attributes_id, objects_held)
    }
  });

  socket.on("simulator", (user_ids, ai_agents_ids, video_idx, config) => { //When simulator connects
    simulator = socket.id;
    user_ids_list = user_ids;
    ai_ids_list = ai_agents_ids;
    all_ids_list = user_ids.concat(ai_agents_ids);
    clients_ids = Array.apply(null, Array(user_ids_list.length));
    ai_ids = Array.apply(null, Array(ai_ids.length));
    all_ids = Array.apply(null, Array(ai_ids.length+user_ids_list.length));
    video_idx_broadcaster = video_idx;
    map_config = config;

  });
  
  socket.on("reset", () => {
    socket.to(simulator).emit("reset", socket_to_simulator_id(socket.id));
  })

  //WEBRTC connection setup
  socket.on("offer", (id, message) => {
    socket.to(id).emit("offer", socket.id, message, user_ids_list[clients_ids.indexOf(id)]);
  });
  socket.on("answer", (id, message) => {
    socket.to(id).emit("answer", socket.id, message);
  });
  socket.on("candidate", (id, message) => {
    socket.to(id).emit("candidate", socket.id, message);
  });

  socket.on("get_id", () => {
    socket.to(socket.id).emit("get_id", clients_ids.indexOf(socket.id));
  });
  socket.on("disconnect", () => {
    socket.to(broadcaster).emit("disconnectPeer", socket.id);
  });

  
  socket.on("ai_action", (action_message) => {//AI action forwarding
    socket.to(simulator).emit("ai_action",action_message,socket_to_simulator_id(socket.id));
  });
  socket.on("ai_status", (idx, status) => {//AI status forwarding
    socket.to(all_ids[idx]).emit("ai_status",status);
  });
  
  socket.on("ai_output", (idx, object_type_coords_map, object_attributes_id, objects_held, sensing_results, ai_status, extra_status, strength, timer) => {//AI output forwarding
    socket.to(all_ids[idx]).emit("ai_output", object_type_coords_map, object_attributes_id, objects_held, sensing_results, ai_status, extra_status, strength, timer);
  });
  
  
  socket.on("human_output", (idx, location, item_info, neighbors_info, timer) => {
    socket.to(all_ids[idx]).emit("human_output", location, item_info, neighbors_info, timer);
    /*
    if(command_line_options.log_output){
        fs.appendFile(dateTime + '_output.txt', String(timer) +',' + '"'+message.replace(/"/g, '\\"')+'"'+','+keys_neighbors+'\n', err => {});
    }
    */
  });
  
  socket.on("agent_reset", (magnebot_id) => {
    socket.to(simulator_id_to_socket(magnebot_id)).emit("agent_reset");
  });
  
  socket.on("message", (message, timestamp, neighbors_list) => { //Forwarding messages between robots

    /*
    var neighbor_keys = Object.keys(neighbors_list);
    for(let c in clients_ids){
        if(! (clients_ids[c] === socket.id)){
            //console.log("really sent message")
            socket.to(clients_ids[c]).emit("message", message, user_ids_list[clients_ids.indexOf(socket.id)]);
        }
    }
    */
    //const origin_id = user_ids_list[clients_ids.indexOf(socket.id)]
    
    if(all_ids.indexOf(socket.id) >= 0 && neighbors_list){
        let source_id = socket_to_simulator_id(socket.id)
        console.log(source_id)
        console.log(neighbors_list)
        
        var keys_neighbors = '"';
        
        for (const [key, value] of Object.entries(neighbors_list)) {
            console.log(key)
            console.log(value)
            keys_neighbors += key + ',';
            if(value === 'human'){
                let c = clients_ids[user_ids_list.indexOf(key)]; 
                console.log(c)
                socket.to(c).emit("message", message, timestamp, source_id);
            } else if(value === 'ai'){
                let c = ai_ids[ai_ids_list.indexOf(key)];
                socket.to(c).emit('message', message, timestamp, source_id);
            }
            
        }
        
        keys_neighbors += '"';
        
        
        if(command_line_options.log_messages){
            fs.appendFile(dateTime + '_messages.txt', String(timestamp) +',' + '"'+message.replace(/"/g, '\\"')+'"'+','+keys_neighbors+'\n', err => {});
        }
    }

  });
  //Every time a key is pressed by someone in their browser, emulate that keypress using xdotool
  socket.on("key", (key, timestamp) => {
    socket.to(simulator).emit("key", key, socket_to_simulator_id(socket.id));
    if(command_line_options.log_key_pressing){
        fs.appendFile(dateTime + '_key_pressing.txt', String(timestamp) +',' + key +'\n', err => {});
    }
    /*
    let idx = clients_ids.indexOf(socket.id);
    
    
    if (window_name && idx >= 0){
        key = key.replace('Arrow', '');
        
        //key = char_replacement[idx][key];
        exec('xdotool key --window ' + window_name + ' ' + key, (error, stdout, stderr) => {
            if (stdout)
                console.log("stdout: " + stdout);
            if (stderr)
                console.log("stderr: " + stderr);
            if (error !== null) {
                console.log("exec error: " + error);
            }
        });
    }
    */
  });
  socket.on("objects_update", (target_id, objects_list) => { //Every time someone discovers/shares an object
    //console.log("stdout: " + socket.id + " " + broadcaster);
    socket.to(simulator_id_to_socket(target_id)).emit("objects_update", objects_list, socket_to_simulator_id(socket.id));
  });
  


  socket.on("neighbors_update", (target_id, neighbors_list) => { //Evertime someone gets close to other robots
    socket.to(simulator_id_to_socket(target_id)).emit("neighbors_update", neighbors_list, socket_to_simulator_id(socket.id));
  });
  socket.on("set_goal", (obj_id) => { //Set visual goal
    socket.to(simulator).emit("set_goal",clients_ids.indexOf(socket.id), obj_id);
  });
});

//server.listen(port, host, () => console.log(`Server is running on port ${port}`));


