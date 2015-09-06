/*
 HTML5tris - A quick implementation of Tetris in HTML5
 Copyright (C) 2014  Jesse Skrivseth <voodoodrul@gmail.com>
 
 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.
 
 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.
 
 You should have received a copy of the GNU General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * A colored block that can be drawn 
 * @param {type} color the css color of the block
 */
function GameBlock(color) {
    this.size = 20;
    this.color = color;
}


/**
 * Models a game of Tetris
 * @param {string} canvasId the HTML element ID of the <canvas> to draw on
 * @param {string} 
 * @returns {Game}
 */
function Game(canvasId) {

    //#region properties

    // the HTML5 canvas to draw on
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext("2d");

    // find the GameBlock size
    this.blockSize = new GameBlock(null).size;  // ask GameBlock how big the blocks are supposed to be
    this.sideBarSize = this.blockSize * 6;      //The size of the sidebar, relative to the block size - sidebar is "6 blocks wide"

    // compute the board width possible given the canvas size and the block size
    this.boardWidth = Math.floor(this.canvas.width / this.blockSize) - Math.floor(this.sideBarSize / this.blockSize);
    this.boardHeight = Math.floor(this.canvas.height / this.blockSize);

    /**
     * stores the hex colors of each shape for the varying difficulty levels
     * first row is difficulty 0, second is difficulty 1, ...
     */
    this.colors = [
        ['cyan', 'blue', 'orange', 'yellow', 'green', 'purple', 'red'],
        ['#FFB60D', '#E80C68', '#004EFF', '#0CE817', '#FFB505', '#E80C8C', '#1BE80C'],
        ['#FF19CF', '#16C5E8', '#FFFA0C', '#E82914', '#1149FF', '#12FF04', '#9009FF'],
        ['#0CE8C5', '#FFD604', '#FF091F', '#E8A908', '#12FF04', '#087DE8', '#F500FF'],
        ['#B214CC', '#5000FF', '#FFDF40', '#FFB100', '#40B0FF', '#3D14CC', '#3D14CC'],
        ['#0CE817', '#FFB505', '#E80C8C', '#1BE80C', '#FFB60D', '#E80C68', '#004EFF'],
        ['#1149FF', '#12FF04', '#9009FF', '#FF19CF', '#16C5E8', '#FFFA0C', '#E82914'],
        ['#E8A908', '#12FF04', '#087DE8', '#F500FF', '#0CE8C5', '#FFD604', '#FF091F'],
        ['#FFB100', '#40B0FF', '#3D14CC', '#3D14CC', '#B214CC', '#5000FF', '#FFDF40'],
        ['cyan', 'blue', 'orange', 'yellow', 'green', 'purple', 'red']
    ];

    /*
     * pre-baked Tetromino shapes, represented as a "bitmask" in hex
     * every configuration of a 4x4 array can be described
     * inspired by: https://github.com/jakesgordon/javascript-tetris/blob/master/index.html
     */
    this.shapes = {
        i: {size: 4, blocks: [0x0F00, 0x2222, 0x00F0, 0x4444], color: 0},
        j: {size: 4, blocks: [0x44C0, 0x8E00, 0x6440, 0x0E20], color: 1},
        l: {size: 3, blocks: [0x4460, 0x0E80, 0xC440, 0x2E00], color: 2},
        o: {size: 2, blocks: [0xCC00, 0xCC00, 0xCC00, 0xCC00], color: 3},
        s: {size: 3, blocks: [0x06C0, 0x8C40, 0x6C00, 0x4620], color: 4},
        t: {size: 3, blocks: [0x0E40, 0x4C40, 0x4E00, 0x4640], color: 5},
        z: {size: 3, blocks: [0x0C60, 0x4C80, 0xC600, 0x2640], color: 6}
    };

    /* 
     * The bitmask values for one GameBlock existing in all possible positions of a 4x4 grid
     * This is used to do a bitmask AND with the shape (above) using i,j indices to see if a GameBlock exists
     * In other words, we're checking to see if i,j is occupied in the hex above
     * 
     * It's fairly clear to visualize the occupied blocks here (zero is empty), and the shapes above are just the sums of
     * the appropriate combination of these elements
     * 
     * For example, the second column here show a vertical bar. The sum of (0x0800 + 0x0400 + 0x0200 + 0x0100) = 0x0F00 above
     */
    this.hexValues = [
        [0x8000, 0x0800, 0x0080, 0x0008],
        [0x4000, 0x0400, 0x0040, 0x0004],
        [0x2000, 0x0200, 0x0020, 0x0002],
        [0x1000, 0x0100, 0x0010, 0x0001]
    ];


    /* GAME STATE */
    this.difficulty = 0;
    this.difficultyTimeouts = [1000, 750, 625, 500, 425, 300, 250, 225, 200, 175];
    this.isRunning = false;
    this.isPaused = false;
    this.isGameOver = false;

    //The game clock, used to tick the game forward, drop pieces, etc. (JS interval)
    this.ticker = null;

    /* SCORE MODEL */
    this.pointsAwardedForLines = [40, 100, 300, 1200];
    this.scorePerLevel = [1200, 1200 * 4, 1200 * 8, 1200 * 16, 1200 * 32, 1200 * 64, 1200 * 128, 1200 * 256, 1200 * 512];

    /*
     * the Game contains a Board, Stats, and 2 Pieces
     * Game manages input, triggers Board and Piece redraw, and deals with game state
     */
    this.gameBoard = null;
    this.gameStats = null;
    this.gamePiece = null;
    this.nextPiece = null;
    this.gameMusic = null;

    // a cache to hold computed gradients
    this.gradientCache = null;

    //#endregion properties

    /**
     * returns a random GamePiece 
     * @returns {GamePiece}
     */
    this.getRandomPiece = function () {
        var temp_key, keys = [];
        for (temp_key in this.shapes) {
            if (this.shapes.hasOwnProperty(temp_key)) {
                keys.push(temp_key);
            }
        }
        var randomShapeKey = keys[Math.floor(Math.random() * keys.length)];
        return new GamePiece(this, randomShapeKey);
    };

    /**
     * swaps the "next" piece and puts it in play
     * generates the subsequent "next" piece
     * if the "next" piece cannot be dropped on the board, the game is over
     * @returns {void}
     */
    this.selectNextPiece = function () {
        this.gamePiece = this.nextPiece;
        this.gamePiece.position = {x: Math.ceil((this.gameBoard.width - this.gamePiece.shapeDescription.size) / 2), y: 0};
        this.nextPiece = this.getRandomPiece();
        //check to see if the piece can fit.. if not, game over
        if (this.gameBoard.isValidMove(this.gamePiece, "down")) {

        } else {
            //game over
            this.isGameOver = true;
            this.togglePause();
            this.gameMusic.selectTrack('gameover.mp3', false);
            this.gameMusic.start();
        }
    };

    /**
     * determines if a GameBlock should exist at i,j given this hex value that describes the shape 
     * does a simple bitwise AND on the shape and a single position in the grid using hexValues[i][j]
     * @param {int} i "x" index
     * @param {int} j "y" index
     * @param {int} shape hex value describing the shape
     * 
     */
    this.indexContainsBlock = function (i, j, shape) {
        // The shape contains i,j, so return true 
        // A block exists at this position in the shape because it was set in the bitmask describing the shape
        if (this.hexValues[i][j] & shape) {
            return true;
        } else {
            return false;
        }
    };

    /**
     * handles user input
     */
    this.handleInput = function (e) {
        switch (e.keyCode) {
            case 38:
                if (!this.isPaused && this.gamePiece && this.gameBoard.isValidMove(this.gamePiece, "rotate")) {
                    this.gamePiece.rotate();
                }
                break;
            case 37:
                if (!this.isPaused && this.gamePiece && this.gameBoard.isValidMove(this.gamePiece, "left")) {
                    this.gamePiece.move("left");
                }
                break;
            case 39:
                if (!this.isPaused && this.gamePiece && this.gameBoard.isValidMove(this.gamePiece, "right")) {
                    this.gamePiece.move("right");
                }
                break;
            case 40:
                if (!this.isPaused) {
                    if (this.gamePiece && this.gameBoard.isValidMove(this.gamePiece, "down")) {
                        this.gamePiece.move("down");
                    } else {
                        this.gameBoard.bakePiece(this.gamePiece);
                    }
                }

                break;
            case 32: //spacebar
                if (!this.isRunning) {
                    this.start();
                } else {
                    this.togglePause();
                }
                break;
        }
        //(re)draw the game
        this.draw();
    };

    /**
     * gets a gradient from the cache or compiles and sets a new one
     * @param {string} type ['baked','next',null] - the type of gradient - used for gradient direction only
     * @param {string} color the color of the piece in hex or name
     * @param {Context} context the context to draw on
     * @returns {gradient}
     */
    this.getGradient = function (type, color, context) {
        // optimization - search the gradient cache to see if we have already compiled this gradient
        var gradientType = "1:";
        if (type === "baked") {
            gradientType = "0:";
        }
        var gradientKey = gradientType + color;
        var gradient = this.gradientCache.get(gradientKey);


        if (!gradient) {
            //no cached gradient was found, so compile one and set it in the cache

            var blockSize = this.blockSize;

            gradient = context.createLinearGradient(0, 0, blockSize, blockSize);
            if (type === "baked") {
                gradient.addColorStop("0", color);
                gradient.addColorStop("1.0", "#555");
            } else {
                gradient.addColorStop("0", "#555");
                gradient.addColorStop("1.0", color);
            }
            this.gradientCache.set(gradientKey, gradient);
        }
        return gradient;
    };


    /**
     * Clears the canvas and draws the gameBoard, gamePieces, and stats
     * @returns {void}
     */
    this.draw = function () {
        //wipe the canvas so we can redraw
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        //draw the game board first
        this.gameBoard.draw();

        //draw the GamePiece (if any)
        if (this.gamePiece) {
            this.gamePiece.draw();
        }

        //draw the "next" piece 
        if (this.nextPiece) {
            this.nextPiece.draw("next");
        }

        //draw the game stats
        this.gameStats.draw();
    };

    /**
     * handles a game tick - drops pieces down or bakes them onto the board if no room to drop
     * called by a JS timer based on current difficulty
     * triggers a repaint
     * @returns {void}
     */
    this.gameTick = function () {
        //Move the gamePiece down 1
        if (game.gamePiece) {
            if (game.gameBoard.isValidMove(game.gamePiece, "down")) {
                game.gamePiece.move("down");
            }
            else {
                game.gameBoard.bakePiece(game.gamePiece);
            }
        }
        game.draw();
    };

    /**
     * start the game - unset any existing ticker and create a new one, based on difficulty
     * @returns {void}
     */
    this.start = function () {
        if (!this.isRunning) {
            this.selectNextPiece();
            if (this.ticker) {
                clearInterval(this.ticker);
            }
            this.ticker = setInterval(this.gameTick, this.difficultyTimeouts[this.difficulty]);
            this.isRunning = true;

            //start audio
            this.gameMusic.selectTrack('tetris.mp3', true);
            this.gameMusic.start();
        }
    };

    /**
     * pause/resume the game. If the game was over, resets the game
     * @returns {void}
     */
    this.togglePause = function () {
        if (!this.isPaused) {
            clearInterval(this.ticker);
            this.ticker = null;
            this.isPaused = true;
            this.gameMusic.pause();
        } else {
            if (this.isGameOver) {
                //reset the game instead..
                this.reset();
                return;
            }
            this.ticker = setInterval(this.gameTick, this.difficultyTimeouts[this.difficulty]);
            this.isPaused = false;
            this.gameMusic.start();
        }
    };

    /**
     * resets the game clock, clearing any soon-to-expire interval
     * @returns {void}
     */
    this.resetTimer = function () {
        clearInterval(this.ticker);
        this.ticker = setInterval(this.gameTick, this.difficultyTimeouts[this.difficulty]);
    };

    /**
     * resets this game
     * @returns {void}
     */
    this.reset = function () {
        clearInterval(this.ticker);
        this.ticker = null;
        this.difficulty = 0;
        this.isGameOver = false;
        this.isRunning = false;
        this.isPaused = false;

        // create a new board, stats, and pieces
        this.gameBoard = new GameBoard(this, this.boardWidth, this.boardHeight);
        this.gameStats = new GameStats(this);
        this.gamePiece = null;
        this.nextPiece = this.getRandomPiece();

        this.start();
    };

    /**
     * resizes the game board based on pixel units
     * redraws the board
     * @param {int} width (in px)
     * @param {int} height (in px)
     * @returns {void}
     */
    this.resize = function (width, height) {
        //resize the canvas
        this.canvas.width = width;
        this.canvas.height = height;

        //resize the div the canvas is drawn on
        this.canvas.parentNode.style.width = width + "px";
        this.canvas.parentNode.style.height = height + "px";

        // compute the board (block) width possible given the canvas size and the block size
        var newWidth = Math.floor(width / this.blockSize) - Math.floor(this.sideBarSize / this.blockSize);
        var newHeight = Math.floor(height / this.blockSize);

        //resize the game board
        this.gameBoard.resize(newWidth, newHeight);

        //resize the board widht (in blocks)
        this.boardWidth = newWidth;
        this.boardHeight = newHeight;

        this.draw();
    };

    /**
     * initializes the Game
     * @returns void
     */
    this.init = function () {
        this.gameBoard = new GameBoard(this, this.boardWidth, this.boardHeight);
        this.gameStats = new GameStats(this);
        this.gamePiece = null;
        this.nextPiece = this.getRandomPiece();
        this.gameMusic = new GameMusic(this);

        this.gradientCache = new GradientCache();

        this.gameMusic.init('tetris.mp3');

        this.draw();

        document.onkeydown = function (e) {
            //Dispatch key events to the game
            game.handleInput(e);
            e.preventDefault();
        };
    };
}

/**
 * models the game board
 * @param {Game} game the Game
 * @param {int} width (in blocks)
 * @param {int} height (in blocks)
 * @returns {GameBoard}
 */
function GameBoard(game, width, height) {

    this.game = game;
    this.width = width;
    this.height = height;

    // this GameBoard hold a <canvas> as a cache - the cache is updated/invalidated as necessary
    this.canvasCache = new CanvasCache(this.game, this.width, this.height);

    //a 2D array to model the game board
    this.gameBoard = [];

    //Populate the board array with zeros
    for (i = 0; i < this.width; i++) {
        this.gameBoard[i] = [];
        for (j = 0; j < this.height; j++) {
            this.gameBoard[i][j] = 0;
        }
    }

    /**
     * determines if the x,y is on the game board
     * @param {type} x
     * @param {type} y
     * @returns {Boolean}
     */
    this.isOnBoard = function (x, y) {
        if (x >= 0 && y >= 0 && x < this.gameBoard.length && y < this.gameBoard[0].length) {
            return true;
        } else {
            return false;
        }
    };

    /**
     * determines if the x,y is occupied by a GameBlock. Values off the board are considered "occupied" for collision
     * @param int x 
     * @param int y
     */
    this.isOccupied = function (x, y) {
        if (!this.isOnBoard(x, y)) {
            return true;
        }
        if (this.gameBoard[x][y] instanceof GameBlock) {
            return true;
        } else {
            return false;
        }
    };

    this.isUnoccupied = function (x, y) {
        return !this.isOccupied(x, y);
    };

    /**
     * determines if the requested move is valid (won't collide with anything) for the gamePiece
     * simulates the move on a cloned GamePiece
     * @param {GamePiece} gamePiece the piece to move
     * @param {string} direction the direction to move/rotate
     * @returns {boolean} whether the move is possible 
     */
    this.isValidMove = function (gamePiece, direction) {
        // clone the gamePiece to simulate the action
        var tmpPiece = new GamePiece(this.game, null);
        tmpPiece.shapeDescription = gamePiece.shapeDescription;
        tmpPiece.height = gamePiece.height;
        tmpPiece.width = gamePiece.width;
        tmpPiece.rotation = gamePiece.rotation;
        tmpPiece.position = {
            x: gamePiece.position.x,
            y: gamePiece.position.y
        };

        switch (direction) {
            case "rotate":
                tmpPiece.rotate();
                break;
            case "left":
            case "right":
            case "down":
                tmpPiece.move(direction);
                break;
        }

        // compute an array for this modified shape
        tmpPiece.computeShape();

        // now check for collisions against the game board
        for (i = 0; i < tmpPiece.height; i++) {
            for (j = 0; j < tmpPiece.width; j++) {
                var pieceBlock = tmpPiece.shapeArray[i][j];
                if (pieceBlock instanceof GameBlock) {
                    var boardPosition = {
                        x: tmpPiece.position.x + i,
                        y: tmpPiece.position.y + j
                    };
                    if (!this.isOnBoard(boardPosition.x, boardPosition.y) || this.isOccupied(boardPosition.x, boardPosition.y)) {
                        return false;
                    }
                }
            }
        }
        return true;
    };

    /**
     * finds any complete lines in the game board based on the piece that was just placed
     * 
     * @param {GamePiece} gamePiece the game piece that was just baked onto the board
     * @returns {array} the indices of any completed lines that will need to be removed
     */
    this.checkLines = function (gamePiece) {
        var completedLines = [];
        var minY, maxY;
        if (gamePiece) {
            //check every row that the gamePiece occupies 
            //there is no need to scan any other rows because only the "baked" piece can matter 
            minY = gamePiece.position.y;
            maxY = minY + gamePiece.height;
        } else {
            //if no gamePiece was provided, check every row
            minY = 0;
            maxY = this.height;
        }

        for (j = minY; j < maxY; j++) {
            brokenLine = false;
            for (i = 0; i < this.width; i++) {
                if (!(this.gameBoard[i][j] instanceof GameBlock)) {
                    brokenLine = true;
                    break;
                }
            }
            if (!brokenLine) {
                completedLines.push(j);
            }
        }
        return completedLines;
    };

    /**
     * collapses the completed lines from the game board
     * works from top-to-bottom, collapsing the stack
     * 
     * @param {array} completedLines
     */
    this.clearLines = function (completedLines) {
        if (completedLines.length > 0) {

            //sort the completed lines to sweep from top-to-bottom (ascending order)
            //the array should already be sorted based on the output from checkLines(), so this may be unneccesary...
            var sortedLines = completedLines.slice().sort(function (a, b) {
                return a - b
            });

            //tally the score
            this.game.gameStats.addScore(this.game.pointsAwardedForLines[sortedLines.length - 1] * (this.game.difficulty + 1));

            //for each row in the sorted array, move all blocks above this line down one unit
            for (i = 0; i < sortedLines.length; i++) {
                var rowNum = sortedLines[i];
                //work "upwards" (toward zero) scanning rows
                for (j = rowNum; j >= 0; j--) {
                    //scan this row left to right, moving any Blocks down 1 unit
                    for (k = 0; k < this.width; k++) {
                        if (j > 0) {
                            this.gameBoard[k][j] = this.gameBoard[k][j - 1];
                        } else {
                            this.gameBoard[k][j] = 0;
                        }
                    }
                }
            }
        }
    };



    /**
     * copies (bakes) a piece onto the game board and replaces the game piece in play with a new one
     * @param {GamePiece} gamePiece the GamePiece to bake on the GameBoard
     */
    this.bakePiece = function (gamePiece) {
        if (gamePiece instanceof GamePiece) {
            var rawPiece = this.game.gamePiece;              //The "uncooked" game piece
            //copy this piece onto the board
            for (i = 0; i < rawPiece.height; i++) {
                for (j = 0; j < rawPiece.width; j++) {
                    var boardPosition = {
                        x: rawPiece.position.x + i,
                        y: rawPiece.position.y + j
                    };
                    //Check to see if this block is on the board - should always be true
                    if (this.isOnBoard(boardPosition.x, boardPosition.y)) {
                        var block = rawPiece.shapeArray[i][j];
                        if (block instanceof GameBlock) {
                            this.gameBoard[boardPosition.x][boardPosition.y] = block;
                        }
                    }
                }
            }

            // find any completed lines
            var completedLines = this.checkLines(gamePiece);

            // remove them
            this.clearLines(completedLines);

            // put the next piece in play
            this.game.selectNextPiece();   //select the new random piece

            //invalidate the cached canvas if there were completed lines - causes the whole board to be rebuilt and cached
            if (completedLines.length > 0) {
                this.canvasCache.invalidate();
                this.draw();
            } else {
                // draw (only) the new baked piece directly on the cache canvas
                this.drawBakedPiece(gamePiece);
            }
        }
    };

    /**
     * draw a single game piece on the (cached) canvas
     * @param {GamePiece} gamePiece
     * @returns {void}
     */
    this.drawBakedPiece = function (gamePiece) {
        var cacheContext = this.canvasCache.context;
        gamePiece.draw("baked", cacheContext);
    };

    /**
     * resize the board, adding or slicing out array elements as necessary
     * @param {int} width
     * @param {int} height
     */
    this.resize = function (newWidth, newHeight) {
        //find the difference between the current size of the canvas and the game board
        for (i = 0; i < Math.max(this.width, newWidth); i++) {
            if (i >= newWidth) {
                // the old board was bigger
                // slice off the end of the array (width)
                this.gameBoard = this.gameBoard.slice(0, newWidth);
                break;
            }
            for (j = 0; j < Math.max(this.height, newHeight); j++) {

                if (j >= newHeight) {
                    // the old board was bigger
                    // slice off the end of the array (height)
                    this.gameBoard[i] = this.gameBoard[i].slice(0, newHeight);
                    break;
                }
                if (i >= this.width) {
                    // the oldboard was smaller
                    // create new array elements
                    this.gameBoard[i] = [];
                    this.gameBoard[i][j] = 0;
                } else if (j >= this.height) {
                    // the oldboard was smaller
                    // create new array elements
                    this.gameBoard[i][j] = 0;
                }
            }
        }
        this.width = newWidth;
        this.height = newHeight;

        // resize the cached canvas
        this.canvasCache.resize(this.width, this.height);

        // immediately redraw
        this.draw();
    };

    /**
     * draws the game board on the canvas
     * the game board consists of Blocks already baked onto it
     */
    this.draw = function () {

        if (!this.canvasCache.isValid()) {
            // the cached canvas is considered invalid - clear the cached canvas and draw fresh
            var cacheContext = this.canvasCache.context;
            var cacheCanvas = this.canvasCache.canvas;

            cacheContext.clearRect(0, 0, cacheCanvas.width, cacheCanvas.height);

            //loop over the array of Blocks on the board
            for (i = 0; i < this.width; i++) {
                for (j = 0; j < this.height; j++) {
                    //If a block is here, draw it
                    if (this.gameBoard[i][j] instanceof GameBlock) {
                        //get facts about the block, then draw the block
                        var blockSize = this.game.blockSize;
                        var posX = i * blockSize;
                        var posY = j * blockSize;
                        cacheContext.strokeStyle = "black";

                        var thisBlockColor = this.game.colors[game.difficulty][this.gameBoard[i][j].color];

                        // get a gradient from the cache
                        var gradient = this.game.getGradient("baked", thisBlockColor, cacheContext);

                        cacheContext.save();
                        cacheContext.translate(posX, posY);
                        cacheContext.fillStyle = gradient;

                        //draw the block on the canvas based on its position in the array
                        cacheContext.fillRect(0, 0, blockSize, blockSize);
                        cacheContext.strokeRect(0, 0, blockSize, blockSize);
                        cacheContext.restore();
                    }
                }
            }
            this.canvasCache.validate();
        }
        // draw the canvas cache
        this.game.ctx.drawImage(this.canvasCache.canvas, 0, 0);
    };
}

/**
 * creates a secondary DOM <canvas>, child to the game's canvas,
 * to use as a cache for the board. Avoids drawing the entire 
 * board from scratch most of the time
 * 
 * @param {Game} game
 * @param {int} width (in blocks)
 * @param {int} height (in blocks)
 * @returns {CanvasCache}
 */
function CanvasCache(game, width, height) {
    this.game = game;
    this.canvas = document.createElement('canvas');
    this.canvas.id = "cache";
    this.canvas.width = width * this.game.blockSize;
    this.canvas.height = height * this.game.blockSize;
    this.game.canvas.appendChild(this.canvas);
    this.context = this.canvas.getContext('2d');
    this.isReady = false;

    /**
     * resize the canvas and invalidate the cache to force a fresh draw
     * @param {int} width (in blocks)
     * @param {int} height (in blocks)
     * @returns {void}
     */
    this.resize = function (width, height) {
        this.canvas.width = width * this.game.blockSize;
        this.canvas.height = height * this.game.blockSize;
        this.invalidate();
    };

    /**
     * determines if the cache is valid and can be drawn as-is
     * @returns {Boolean}
     */
    this.isValid = function () {
        return this.isReady;
    };

    /**
     * marks the cache invalid to force a rebuild
     * @returns {void}
     */
    this.invalidate = function () {
        this.isReady = false;
    };

    /**
     * marks the cache valid - the cache can now be used as-is
     * @returns {void}
     */
    this.validate = function () {
        this.isReady = true;
    };

}

/**
 * caches compiled HTML5 gradients
 * @returns {GradientCache}
 */
function GradientCache() {
    this.cache = {};
    this.get = function (key) {
        if (this.cache[key]) {
            return this.cache[key];
        } else {
            return null;
        }
    };
    this.set = function (key, gradient) {
        this.cache[key] = gradient;
    };
}

/**
 * models a Tetromino game piece
 * @param {Game} game the Game object 
 * @param {string} shape char value describing this shape 
 */
function GamePiece(game, shape) {
    this.game = game;
    /**
     * The shape is denoted by a char in the list [i,j,l,o,s,t,z]
     * This is the key into the hashed set of precomputed shapes
     */
    this.shapeDescription = this.game.shapes[shape];

    /**
     * the current 90 degree rotation [0,1,2,3] for this piece
     */
    this.rotation = 0;

    /**
     * This contains the shape array, given the current rotation + shapeDescription
     */
    this.shapeArray = [];

    //FIXME: to hard-code or not to hard-code...
    this.height = 4;
    this.width = 4;

    /**
     * The position of this piece on the board
     */
    this.position = {x: 0, y: 0};

    /**
     * Populate the 2D array for this shape, given the current rotation + shapeDescription
     */
    this.computeShape = function () {
        for (i = 0; i < this.height; i++) {
            this.shapeArray[i] = [];
            for (j = 0; j < this.width; j++) {
                //check to see if this i,j index is in the shapeDescription bitmask - if so, make a GameBlock here
                var currentShape = this.shapeDescription.blocks[this.rotation];
                if (this.game.indexContainsBlock(i, j, currentShape)) {
                    this.shapeArray[i][j] = new GameBlock(this.shapeDescription.color);
                } else {
                    this.shapeArray[i][j] = 0;
                }

            }
        }
    };

    /**
     * rotates the piece by incrementing this.rotation through a cycle of integers
     * wipes the shape array to force the shape to be recompiled 
     * @returns {void}
     */
    this.rotate = function () {
        //rotate the piece  - don't bother doing any collision checking here as this may be a synth test
        if (this.rotation <= 2) {
            this.rotation++;
        } else {
            this.rotation = 0;
        }
        this.shapeArray = [];
    };

    /**
     * move or rotate the piece - don't bother doing any collision checking here
     * @param {string} direction ['right','left','down','rotate']
     * @returns {void}
     */
    this.move = function (direction) {
        switch (direction) {
            case 'right':
                this.position.x += 1;
                break;
            case 'left':
                this.position.x -= 1;
                break;
            case 'down':
                this.position.y += 1;
                break;
        }
    };

    /**
     * draw the GamePiece
     * compute the shape of the piece first, if necessary
     * @param {type} type
     * @param {type} context
     * @returns {void}
     */
    this.draw = function (type, context) {
        // draws on the context passed to the function, otherwise the game's context
        if (!context) {
            context = this.game.ctx;
        }
        // (re)compute the array of Blocks for this shape if necessary (when fresh or after rotation)
        if (this.shapeArray.length === 0) {
            this.computeShape();
        }
        // draw this array of Blocks based on the current position of the piece
        for (i = 0; i < this.height; i++) {
            for (j = 0; j < this.width; j++) {
                var element = this.shapeArray[i][j];
                //If a block is here, draw it
                if (element instanceof GameBlock) {
                    //draw the block
                    var blockSize = this.game.blockSize;
                    context.strokeStyle = "black";     //border color
                    var thisBlockColor = this.game.colors[this.game.difficulty][element.color];

                    // get a gradient, either existing in the cache or generate one now
                    var gradient = this.game.getGradient(type, thisBlockColor, context);
                    context.fillStyle = gradient;

                    var posX, posY;

                    if (type === "next") {
                        // draw this piece in the "next" box (ignore position)
                        // TODO: don't hardcode the padding (100px) from the right side
                        posX = (i * blockSize) + this.game.canvas.width - 100;
                        posY = (j + 1) * blockSize;
                    } else {
                        // draw the block on the canvas based on its position in the array
                        posX = (i + this.position.x) * blockSize;
                        posY = (j + this.position.y) * blockSize;
                    }
                    context.save();
                    context.translate(posX, posY);
                    context.fillRect(0, 0, blockSize, blockSize);      //draw rectangle
                    context.strokeRect(0, 0, blockSize, blockSize);    //border
                    context.restore();
                }
            }
        }
    };
}

/**
 * stores game stats and draws the sidebar
 * TODO: make the sidebar dynamically sized
 * @param {Game} game the Game 
 * @returns {GameStats}
 */
function GameStats(game) {

    this.game = game;
    this.score = 0;

    this.addScore = function (val) {
        this.score += val;
        if (this.game.gameStats.score > this.game.scorePerLevel[this.game.difficulty]) {
            //proceed to the next level
            if (this.game.difficulty < 9) {
                this.game.difficulty++;
                this.game.resetTimer();
            }
        }
    };

    this.resetScore = function () {
        this.score = 0;
    };

    this.draw = function () {
        this.game.ctx.font = "20px Verdana";
        // Create gradient
        var gradient = this.game.ctx.createLinearGradient(0, 0, this.game.canvas.width, 0);
        gradient.addColorStop("0", "magenta");
        gradient.addColorStop("0.5", "blue");
        gradient.addColorStop("1.0", "red");


        this.game.ctx.fillStyle = gradient;
        this.game.ctx.strokeStyle = gradient;

        //Draw "next" box
        this.game.ctx.strokeRect(this.game.canvas.width - 110, 10, 100, 80);
        this.game.ctx.fillStyle = "#eee";
        this.game.ctx.fillRect(this.game.canvas.width - 80, 5, 50, 10);  //"legend" text background
        this.game.ctx.fillStyle = gradient;
        this.game.ctx.fillText("Next", this.game.canvas.width - 80, 18);

        this.game.ctx.fillText("Level", this.game.canvas.width - 100, 120);
        this.game.ctx.fillText(this.game.difficulty + 1, this.game.canvas.width - 100, 140);
        this.game.ctx.fillText("Score", this.game.canvas.width - 100, 200);
        this.game.ctx.fillText(this.score, this.game.canvas.width - 100, 220);
        this.game.ctx.fillText("Next", this.game.canvas.width - 100, 260);
        this.game.ctx.fillText(this.game.scorePerLevel[this.game.difficulty], this.game.canvas.width - 100, 280);

        var actionString = "";
        if (!this.game.isRunning) {
            actionString = "play";
        } else if (this.game.isGameOver) {
            actionString = "restart";
        } else if (!this.game.isPaused) {
            actionString = "pause";
        } else if (this.game.isPaused) {
            actionString = "resume";
        }
        this.game.ctx.font = "12px Verdana";
        this.game.ctx.fillText("Press SPACE", this.game.canvas.width - 100, 320);
        this.game.ctx.fillText("to " + actionString, this.game.canvas.width - 100, 334);

        if (this.game.isGameOver) {
            this.game.ctx.fillStyle = "rgba(255,255,255,0.8)";
            this.game.ctx.fillRect(0, 0, this.game.canvas.width, this.game.canvas.height);
            this.game.ctx.font = "36px Verdana";
            this.game.ctx.fillStyle = "black";
            this.game.ctx.fillText("Game Over", (this.game.canvas.width / 2) - 110, (this.game.canvas.height / 2));
            this.game.ctx.font = "12px Verdana";
            this.game.ctx.fillText("Press SPACE to restart", (this.game.canvas.width / 2) - 70, (this.game.canvas.height / 2) + 80);
        } else if (this.game.isPaused) {
            this.game.ctx.fillStyle = "rgba(255,255,255,0.8)";
            this.game.ctx.fillRect(0, 0, this.game.canvas.width, this.game.canvas.height);
            this.game.ctx.font = "36px Verdana";
            this.game.ctx.fillStyle = "black";
            this.game.ctx.fillText("PAUSED", (this.game.canvas.width / 2) - 80, (this.game.canvas.height / 2));
            this.game.ctx.font = "12px Verdana";
            this.game.ctx.fillText("Press SPACE to resume", (this.game.canvas.width / 2) - 80, (this.game.canvas.height / 2) + 80);
        }
    };
}

function GameMusic(game) {
    this.game = game;
    this.player = null;
    this.isPlaying = false;

    this.start = function () {
        this.player.play();
        this.isPlaying = true;
    };

    this.pause = function () {
        this.player.pause();
    };
    this.selectTrack = function (track, loop) {
        this.player.src = track;
        this.player.loop = loop;
        this.player.load();
    };

    this.init = function (track) {
        audio = document.createElement("audio");
        audio.src = track;
        audio.loop = true;
        this.game.canvas.appendChild(audio);
        this.player = audio;
    };
}
