let selectedSquare = null;

window.addEventListener('DOMContentLoaded', () => {
    fetchBoard();
    document.getElementById('resetBtn').addEventListener('click', resetGame);
    document.getElementById('aiMoveBtn').addEventListener('click', aiMove);
});

/**
 * Fetch the current board state
 */
function fetchBoard() {
    fetch('/api/board')
        .then(res => res.json())
        .then(data => {
            renderBoard(data.board);
            updateStatus(data.currentPlayer);
        })
        .catch(err => {
            console.error('Error fetching board:', err);
            showError('Error fetching board: ' + err.message);
        });
}

/**
 * Render the board in #chessboard
 */
function renderBoard(board) {
    const boardDiv = document.getElementById('chessboard');
    boardDiv.innerHTML = '';

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const squareDiv = document.createElement('div');
            squareDiv.classList.add('square');
            // Light or dark background
            if ((row + col) % 2 === 0) {
                squareDiv.classList.add('light');
            } else {
                squareDiv.classList.add('dark');
            }

            const piece = board[row][col];
            if (piece !== '.') {
                squareDiv.textContent = piece;
            }

            squareDiv.setAttribute('data-row', row);
            squareDiv.setAttribute('data-col', col);
            squareDiv.addEventListener('click', onSquareClick);

            boardDiv.appendChild(squareDiv);
        }
    }
}

/**
 * Handle user clicking a square
 */
function onSquareClick(e) {
    const clickedSquare = e.currentTarget;
    const row = parseInt(clickedSquare.getAttribute('data-row'));
    const col = parseInt(clickedSquare.getAttribute('data-col'));

    // If no selection yet, select this square (if it has a piece)
    if (!selectedSquare) {
        if (clickedSquare.textContent.trim() !== '') {
            selectedSquare = { row, col };
            clickedSquare.style.outline = '2px solid red';
        }
    } else {
        // We already selected a square => this is the 'to' square
        const from = { ...selectedSquare };
        const to = { row, col };
        clearSelectionHighlight();
        selectedSquare = null;

        postUserMove(from, to);
    }
}

/**
 * Post user move to /api/move
 */
function postUserMove(from, to) {
    fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to }),
    })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                showError(data.error);
            } else {
                renderBoard(data.board);
                updateStatus(data.currentPlayer);
            }
        })
        .catch(err => {
            console.error('Error posting user move:', err);
            showError('Error posting user move: ' + err.message);
        });
}

/**
 * Clear outline from previously selected squares
 */
function clearSelectionHighlight() {
    const squares = document.querySelectorAll('.square');
    squares.forEach(sq => {
        sq.style.outline = 'none';
    });
}

/**
 * AI Move => /api/ai-move
 */
function aiMove() {
    fetch('/api/ai-move', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                showError(data.error);
            } else {
                renderBoard(data.board);
                updateStatus(data.currentPlayer);
            }
        })
        .catch(err => {
            console.error('Error in AI move:', err);
            showError('Error in AI move: ' + err.message);
        });
}

/**
 * Reset => /api/reset
 */
function resetGame() {
    fetch('/api/reset', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            renderBoard(data.board);
            updateStatus(data.currentPlayer);
        })
        .catch(err => {
            console.error('Error resetting game:', err);
            showError('Error resetting game: ' + err.message);
        });
}

/**
 * Update the status text AND color:
 * - Green if White's turn
 * - Yellow if Black's turn
 * - Red if there's an error (handled by showError)
 */
function updateStatus(currentPlayer) {
    const statusEl = document.getElementById('status');
    if (currentPlayer === 'white') {
        statusEl.textContent = 'It is White’s turn (your move).';
        statusEl.style.backgroundColor = 'green';
    } else {
        statusEl.textContent = 'It is Black’s turn (AI is thinking).';
        statusEl.style.backgroundColor = 'yellow';
    }
}

/**
 * Show an error in red
 */
function showError(msg) {
    const statusEl = document.getElementById('status');
    statusEl.textContent = 'Error: ' + msg;
    statusEl.style.backgroundColor = 'red';
}
