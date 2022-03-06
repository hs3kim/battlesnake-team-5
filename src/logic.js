const {getSafeMoves} = require('./safe-moves')
const v8 = require('v8');

const structuredClone = obj => {
  return v8.deserialize(v8.serialize(obj));
};

class Node {
  x;
  y;
  constructor(x, y) {
    this.x = x
    this.y = y 
  }
}

class Board {
  width;
  height;
  food;
  // hazards;
  snakes;
  constructor(gameBoard) {
    this.width = gameBoard.width;
    this.height = gameBoard.height;
    this.food = gameBoard.food;
    // this.hazards = gameBoard.hazards;
    this.snakes = gameBoard.snakes;
  }
}

class State {
  board;
  you;
  constructor(gameState) {
    this.board = new Board(gameState.board);
    this.you = gameState.you;
  }
}

function info() {
    console.log("INFO")
    const response = {
        apiversion: "1",
        author: "",
        color: "#FF0000",
        head: "evil",
        tail: "bolt"
    }
    return response
}

function start(gameState) {
    console.log(`${gameState.game.id} START`)
}

function end(gameState) {
    console.log(`${gameState.game.id} END\n`)
}

function move(gameState) {
  let isAboutToTimeout = getTimeout()
  try{
     //console.log(gameState)
    let possibleMoves = getSafeMoves(gameState)
    // Step 0: Don't let your Battlesnake move back on its own neck
    const myHead = gameState.you.head
    const myNeck = gameState.you.body[1]

    // Find nearest food
    let nearestFood = {}
    for (const food of gameState.board.food){
      let dist = foodDistance(gameState.you.head, food)
      if (!isObjectEmpty(nearestFood)) {
        if (dist < nearestFood.distance){
          nearestFood = {x:food.x, y:food.y, distance:dist}
        }
      } else{
        nearestFood = {x:food.x, y:food.y, distance:dist}
      }
    }
    let response = {}
    if (!isObjectEmpty(nearestFood)){
      let optimalMoves = []
      if (nearestFood.x > gameState.you.head.x) {
        optimalMoves.push('right')
      } else if (nearestFood.x < gameState.you.head.x) {
        optimalMoves.push('left')
      }
  
      if (nearestFood.y > gameState.you.head.y) {
        optimalMoves.push('up')
      } else if (nearestFood.y < gameState.you.head.y) {
        optimalMoves.push('down')
      }
      console.log('optimalMoves:', optimalMoves, 'possibleMoves:', possibleMoves)
      // let Moves = optimalMoves.filter((move) => possibleMoves.includes(move))
      // if (Moves.length == 0){
      //   Moves = possibleMoves
      // }
      let Moves = possibleMoves
      let areas = {'up': -1, 'down': -1, 'right': -1, 'left': -1}
      for (const move of Moves){
        // console.log('entering for loop')
        // const newState = getResult(gameState, move)
        const area = getAreaOfFreedom(gameState, move, isAboutToTimeout)
        // console.log('area', area, 'move', move)
        areas[move] = area
      }
      let safeMoves = Moves.filter((move) => areas[move] >= gameState.you.length)
      
      if (safeMoves.length == 0){
        console.log('possibleMoves[0]')
        // instead of using a random safe move, choose direction with larger area
        return {
          move:Object.keys(areas).reduce((a, b) => areas[a] >= areas[b] ? a : b)
        }
      }
      optimalMoves = optimalMoves.filter((move) => safeMoves.includes(move))
      if (optimalMoves.length == 0){
        // console.log('safeMoves[0]')
        return {
          move:safeMoves[0]
        }
      } else {
        // console.log('optimalMoves[0]')
        return {
          move:optimalMoves[0]
        }
      }

    
    } else {
      return {
        move:Object.keys(areas).reduce((a, b) => areas[a] >= areas[b] ? a : b)
      }
    }
    
  }
   catch(error) {
     console.error(error)
     const response = defaultMove(gameState)
     
    console.log(`${gameState.game.id} MOVE ${gameState.turn}: ${response.move}`);
     return response
   }
  
}

function getResult(state, action) {
  const newBoard = structuredClone(state.board);
  // assume no new food and remove eaten food
  newBoard.food = newBoard.food.filter((foo) => !foo.consumed);
  // update your head pos
  const myHead = structuredClone(state.you.head);
  switch (action) {
    case 'up': myHead.y += 1; break;
    case 'down': myHead.y -= 1; break;
    case 'left': myHead.x -= 1; break;
    case 'right': myHead.x += 1; break;
  }
  // update all snakes before collision
  for (const [i, snake] of state.board.snakes.entries()) {
    const newSnake = newBoard.snakes[i];
    if (snake.id == state.you.id) {
      newSnake.head = myHead;
    } else {
      // assume no intelligence i.e naively move other snake heads forward
      if (isMovingUp(snake)) newSnake.head.y += 1;
      else if (isMovingDown(snake)) newSnake.head.y -= 1;
      else if (isMovingLeft(snake)) newSnake.head.x -= 1;
      else if (isMovingRight(snake)) newSnake.head.x += 1;
      else throw ['fuc> ', snake.head, snake.body];
    }
    // check if food was eaten
    const ateFood = newBoard.food.find((foo) => foo.x == newSnake.head.x && foo.y == newSnake.head.y);
    if (ateFood) {
      // mark eaten food for deletion next tick and increase length
      ateFood.consumed = true;
      newSnake.length += 1;
      newSnake.health = 100;
    } else {
      // remove last body segment
      newSnake.body.pop();
      newSnake.health -= 1;
      if (newSnake.health == 0) {
        newSnake.markedForDeath = true;
        continue;
      }
    }
    // add new body segment where head is
    newSnake.body.unshift(structuredClone(newSnake.head));
  }
  // handle snake collisions
  for (const otherSnake of newBoard.snakes) {
    for (const snake of newBoard.snakes) {
      if (snake.markedForDeath) break;
      // head on head collision
      if (snake.id != otherSnake.id && snake.head.x == otherSnake.head.x && snake.head.y == otherSnake.head.y) {
        if (snake.length < otherSnake.length) {
          snake.markedForDeath = true;
        } else if (snake.length > otherSnake.length) {
          otherSnake.markedForDeath = true;
        } else {
          snake.markedForDeath = true;
          otherSnake.markedForDeath = true;
        }
        break;
      }
      // head on body collision
      for (let j = 1; j < otherSnake.body; ++j) {
        if (snake.head.x == otherSnake.body[j].x && snake.head.y == otherSnake.body[j].y) {
          snake.markedForDeath = true;
          break;
        }
      }
    }
  }
  const you = structuredClone(newBoard.snakes.find((snake) => snake.id == state.you.id));
  if (!you) throw 'simulated death';
  // kill snakes marked for death
  newBoard.snakes = newBoard.snakes.filter((snake) => !snake.markedForDeath);
  return new State({ board: newBoard, you });
}

function getAreaOfFreedom(state, move, isAboutToTimeout) {
  // console.log('move', move)
  const headNode = new Node(state.you.head.x, state.you.head.y)
  // console.log('headNode', headNode)
  let initial = performMove(headNode, move)
  // console.log('initial', initial)
  const frontier = [initial]
  let area = 0
  const reached = new Set();
  reached.add(JSON.stringify(initial))
  while (frontier.length) {
    // console.log(reached, area)
    if (isAboutToTimeout()) {
      console.log('About to timeout')
      return area
    }
    let node = frontier.pop()
    // console.log(node)
    if (0 <= node.x && node.x < state.board.width && 0 <= node.y && node.y < state.board.height) {
      // console.log('within board boundary')
    }
    if (0 <= node.x && node.x < state.board.width && 0 <= node.y && node.y < state.board.height
       && state.board.snakes.every(
         (snake) => snake.body.every((segment, i) => {
           return !(segment.x == node.x && segment.y == node.y)
         } )
    )) {
      area += 1
      for (const child of expand(node)) {
        let key = JSON.stringify(child)
        if (!reached.has(key)) {
          reached.add(key)
          frontier.push(child)
        }
      }
    }
  }
  return area
}

function expand(node){
  return [
    new Node(node.x, node.y + 1),
    new Node(node.x, node.y -1),
    new Node(node.x + 1, node.y),
    new Node(node.x - 1, node.y),
  ]
  // return getSafeMoves(state).map((move) => {
  //   console.log('node', node, 'expand', move, )
  //   let newNode = new Node(node.x, node.y)
  //   switch(move) {
  //     case 'up': newNode.y += 1
  //     case 'down': newNode.y -= 1
  //     case 'left': newNode.x -= 1
  //     case 'right': newNode.x += 1
  //   }
  //   return newNode
  // })
}

function performMove(node, move) {
    let newNode = new Node(node.x, node.y)
    switch(move) {
      case 'up': newNode.y += 1; break;
      case 'down': newNode.y -= 1; break;
      case 'left': newNode.x -= 1; break;
      case 'right': newNode.x += 1; break;
    }
    return newNode
}

function isObjectEmpty(obj) {
    return Object.keys(obj).length === 0;
}

function foodDistance(head, food) {
  return (Math.abs(food.x - head.x) + Math.abs(food.y - head.y))
}

function getActions(state) {
  return getSafeMoves(state);
}

function isMovingUp(snake) {
  return snake.head.x == snake.body[1].x && snake.head.y == snake.body[1].y+1;
}

function isMovingDown(snake) {
  return snake.head.x == snake.body[1].x && snake.head.y == snake.body[1].y-1;
}

function isMovingLeft(snake) {
  return snake.head.x == snake.body[1].x-1 && snake.head.y == snake.body[1].y;
}

function isMovingRight(snake) {
  return snake.head.x == snake.body[1].x+1 && snake.head.y == snake.body[1].y;
}

function defaultMove(gameState) {
  // try to move forward, otherwise random
  let move;
  const actions = getActions(new State(gameState));
  console.error('trying to move forward...');
  if (actions.includes('up') && isMovingUp(gameState.you)) move = 'up';
  else if (actions.includes('down') && isMovingDown(gameState.you)) move = 'down';
  else if (actions.includes('left') && isMovingLeft(gameState.you)) move = 'left';
  else if (actions.includes('right') && isMovingRight(gameState.you)) move = 'right';
  else {
    console.error('moving randomly...');
    move = actions[Math.floor(Math.random() * actions.length)];
  }
  return { move };
}

function getTimeout() {
  const startTime = new Date();
  return () => {
    const currentTime = new Date();
    return currentTime-startTime > 200;
  }
}

module.exports = {
    info: info,
    start: start,
    move: move,
    end: end
}
