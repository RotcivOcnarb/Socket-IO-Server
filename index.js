// Realiza o require do express, http, e socketio
var app = require('express')();
// passa o express para o http-server
var http = require('http').Server(app);
// passa o http-server par ao socketio
var io = require('socket.io')(http);

var allConnections = {};
var rooms = {};

// sempre que o socketio receber uma conexão vai devoltar realizar o broadcast dela
io.on('connection', function(socket){	
	var id = generateID5(); //Cria um ID pra pessoa q entrou e coloca o socket dela na lista
	allConnections[id] = socket;

	socket.on('msg', function(obj){
		if(callbacks[obj.path]){
			callbacks[obj.path](obj, id);
		}
		else{
			console.log("message path "+obj.path+" not found");
		}
	});
	
	socket.on('disconnect', function () {	
		for(k in Object.keys(rooms)){
			var room = rooms[Object.keys(rooms)[k]];
			if(room.player_data[id]){
				var oponentID = getOponentID(room, id);
				if(oponentID)
					if(room.player_data[oponentID])
						sendBackData(oponentID, "/exitRoom", [id]);
					
				delete room.player_data[id];
			}
		}
		clearRooms();
		delete allConnections[id];
	});
  
});

function replaceAll(str, from, to){
	return str.split(from).join(to);
}

var callbacks = {
	"/myID": function(request, id){
		sendBackData(id, "/myID", [id]);
	},
	"/rooms" : function(request, id){
		var parameters = [];
		for(k in Object.keys(rooms)){
			var key = Object.keys(rooms)[k];
			parameters.push(replaceAll(JSON.stringify(rooms[key]), "\"", "|"));
		}
		
		sendBackData(id, "/rooms", parameters);
	},
	"/createRoom": function(request, id){
		var roomName = request.parameters[0];
		var password = request.parameters[1];
		var roomID = generateID5();
		while(rooms[roomID]){
			roomID = generateID5();
		}
		
		var roomData = {
			"id": roomID,
			"roomName": roomName,
			"password": password,
			"players": 0,
			"player_data": {}
		};
		rooms[roomID] = roomData;
				
		sendBackData(id, "/createRoom", [replaceAll(JSON.stringify(roomData), "\"", "|")]);
		
	},
	"/enterRoom": function(request, id){
		var roomID = request.parameters[0];		
		var room = rooms[roomID];
		
		if(room.players < 2 && !room.player_data[id]){
			room.player_data[id] = {
				"ID": id,
				"heroes": [],
				"ready": false
			};
			room.players = Object.keys(room.player_data).length;
		}
		
		sendBackData(id, "/enterRoom", []);
		
		var oponentID = getOponentID(room, id);
		if(room.player_data[oponentID])	//Tem que avisar ao oponente que eu acabei de entrar na sala
			sendBackData(oponentID, "/oponentEnteredRoom", []);
		
	},
	"/exitRoom": function(request, id){
		var roomID = request.parameters[0];
		var room = rooms[roomID];
		
		if(!room) return;
		
		if(room.player_data[id]){
			var oponentID = getOponentID(room, id);
			if(oponentID)
				if(room.player_data[oponentID])
					sendBackData(oponentID, "/exitRoom", [id]);
			
			delete room.player_data[id];
			room.players = Object.keys(room.player_data).length;
			
			if(room.players == 0)
				delete rooms[roomID];
		}
	},
	"/finishHeroSelection": function(request, id){
		var roomID = request.parameters[0];
		var room = rooms[roomID];
		
		if(room.player_data[id]){
			room.player_data[id].heroes = [
				request.parameters[1],
				request.parameters[2],
				request.parameters[3],
				request.parameters[4],
				request.parameters[5],
			];
		}
		
		var oponentID = getOponentID(room, id);
		if(room.player_data[oponentID])	//Tem que avisar ao oponente (se tiver um) que eu terminei de escolher os heróis
			sendBackData(oponentID, "/oponentSelectedHeroes", room.player_data[id].heroes);

	},
	"/requestOponentHeroes": function(request, id){
		var roomID = request.parameters[0];
		var room = rooms[roomID];
		
		var player0 = Object.keys(room.player_data)[0];
		var player1 = Object.keys(room.player_data)[1]; //se eu to sozinho, isso dá undefined;
		
		if(!player1){
			return;
		}
		var oponentID = getOponentID(room, id);
		if(room.player_data[oponentID].heroes.length == 5){
			//Devolve os heróis q o oponente escolheu;		
			sendBackData(id, "/oponentSelectedHeroes", room.player_data[oponentID].heroes);
			
			if(room.player_data[oponentID].ready)
				sendBackData(id, "/oponentCheckReady", []);
			
			return;
		}
		else{
			//Devolve q o oponente ainda não escolheu os heróis dele
			sendBackData(id, "/oponentEnteredRoom", []);
		}
		
	},
	"/checkReady": function(request, id){
		var roomID = request.parameters[0];
		var room = rooms[roomID];
		
		room.player_data[id].ready = true;
		
		sendBackData(id, "/checkReady", []);
		
		var oponentID = getOponentID(room, id);
		if(room.player_data[oponentID])
			sendBackData(oponentID, "/oponentCheckReady", []);
	},
	"/uncheckReady": function(request, id){
		var roomID = request.parameters[0];
		var room = rooms[roomID];
		
		room.player_data[id].ready = false;
		
		sendBackData(id, "/uncheckReady", []);
		
		var oponentID = getOponentID(room, id);
		if(room.player_data[oponentID])
			sendBackData(oponentID, "/oponentUncheckReady", []);
	},
	"/gameStart": function(request, id){
		var roomID = request.parameters[0];
		var room = rooms[roomID];
		
		//gera um dos dois players aleatóriamente, e esse q vai ser o primeiro turno
		var firstTurnPlayer = Object.keys(room.player_data)[parseInt(Math.random() * 2)];
		sendBackData(id, "/gameStart", [firstTurnPlayer]);
		
		var oponentID = getOponentID(room, id);
		sendBackData(oponentID, "/gameStart", [firstTurnPlayer]);
	},
	"/turnPass": function(request, id){
		var roomID = request.parameters[0];
		var room = rooms[roomID];
		var oponentID = getOponentID(room, id);
		sendBackData(oponentID, "/oponentTurnPass", []);
		sendBackData(id, "/turnPass", []);
	},
	"/heroesPositions": function(request, id){
		forwardToOponent(request, id);
	},
	"/heroMove": function(request, id){
		var roomID = request.parameters[0];
		var room = rooms[roomID];
		var oponentID = getOponentID(room, id);
		request.parameters.shift();
		sendBackData(oponentID, "/oponentMoveHero", request.parameters);
	},
	"/heroKilled": function(request, id){
		forwardToOponent(request, id);
	},
	"/heroKilledFailed": function(request, id){
		forwardToOponent(request, id);
	},
	"/flagPass": function(request, id){
		forwardToOponent(request, id);
	},
	"/activatedEffect": function(request, id){
		forwardToOponent(request, id);
	}
};

function forwardToOponent(request, id){
	var roomID = request.parameters[0];
	var room = rooms[roomID];
	var oponentID = getOponentID(room, id);
	if(oponentID){
		request.parameters.shift();
		sendBackData(oponentID, request.path, request.parameters);
	}
}

function sendBackData(id, path, parameters){
	var obj = {
		"path":  path,
		"parameters": parameters
	};
	allConnections[id].emit('msg', JSON.stringify(obj));
}

function clearRooms(){
	for(var k in Object.keys(rooms)){
		var key = Object.keys(rooms)[k];
		var room = rooms[key];
		
		room.players = Object.keys(room.player_data).length;
		if(room.players == 0)
			delete rooms[key];
	}
}

function getOponentID(room, id){
	var player0 = Object.keys(room.player_data)[0];
	var player1 = Object.keys(room.player_data)[1];
	
	if(!player1) return null;
	if(player0 == id) return player1;
	if(player1 == id) return player0;
	return null;
}

function generateID5(){
	var letters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890";
	var id = "";
	for(var i = 0; i < 5; i ++){
		id += letters[parseInt(Math.random() * letters.length)];
	}
	return id;
}

// inicia o servidor na porta informada, no caso vamo iniciar na porta 3000
http.listen(1337, function(){
	console.log('Servidor rodando em: http://localhost:1337');
});

