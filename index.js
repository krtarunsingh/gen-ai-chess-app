// index.js
import express from 'express';
import { fileURLToPath } from 'url';
import path, { dirname } from 'path';
import { Chess } from 'chess.js';
import OpenAI from 'openai';

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3000;

// Middleware to parse JSON and serve static files
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Chess.js engine (standard starting position)
let chess = new Chess();

// Initialize OpenAI client
// (In production, use process.env.OPENAI_API_KEY or a secure config)
const openai = new OpenAI({
    apiKey: 'OPENAI_API_KEY', // Replace with your real key
});

/**
 * Convert the chess.js board structure (8x8 array) into a 2D array
 * of Unicode chars representing each piece (or '.' for empty).
 */
function getUnicodeBoard() {
    const unicodeMap = {
        pb: '♟', rb: '♜', nb: '♞', bb: '♝', qb: '♛', kb: '♚', // black
        pw: '♙', rw: '♖', nw: '♘', bw: '♗', qw: '♕', kw: '♔', // white
    };

    const rows = chess.board(); // returns 8x8 with { type, color } or null
    const output = [];

    for (let r = 0; r < 8; r++) {
        const rowArr = [];
        for (let c = 0; c < 8; c++) {
            const cell = rows[r][c];
            if (cell === null) {
                rowArr.push('.');
            } else {
                const key = cell.type + cell.color; // e.g. "p" + "b" => "pb"
                rowArr.push(unicodeMap[key]);
            }
        }
        output.push(rowArr);
    }
    return output;
}

/**
 * Convert row,col from the front-end grid to chess notation:
 * row=0,col=0 => 'a8' ... row=7,col=7 => 'h1'
 */
function coordsToAlgebraic(row, col) {
    const file = String.fromCharCode('a'.charCodeAt(0) + col); // 0->a..7->h
    const rank = 8 - row; // 0->8..7->1
    return file + rank;
}

/**
 * GET /api/board
 * Returns the current board, which player's turn it is, and move history.
 */
app.get('/api/board', (req, res) => {
    res.json({
        board: getUnicodeBoard(),
        currentPlayer: chess.turn() === 'w' ? 'white' : 'black',
        history: chess.history({ verbose: true }),
    });
});

/**
 * POST /api/move
 * { from: {row, col}, to: {row, col} }
 * Only allowed if it's White's turn.
 */
app.post('/api/move', (req, res) => {
    const { from, to } = req.body;
    if (!from || !to) {
        return res.status(400).json({ error: 'Missing from/to in request body.' });
    }

    // Ensure it's White's turn (the user)
    if (chess.turn() !== 'w') {
        return res.status(400).json({ error: 'It is not White’s turn.' });
    }

    const fromSquare = coordsToAlgebraic(from.row, from.col);
    const toSquare = coordsToAlgebraic(to.row, to.col);

    const moveResult = chess.move({ from: fromSquare, to: toSquare, promotion: 'q' });
    if (!moveResult) {
        return res.status(400).json({ error: 'Illegal move.' });
    }

    return res.json({
        board: getUnicodeBoard(),
        currentPlayer: chess.turn() === 'w' ? 'white' : 'black',
        history: chess.history({ verbose: true }),
    });
});

/**
 * POST /api/ai-move
 * - Must be Black's turn
 * - Calls OpenAI with a custom prompt
 * - If we get an invalid move, we retry up to 3 times
 * - If all else fails, error.
 */
app.post('/api/ai-move', async (req, res) => {
    if (chess.turn() === 'w') {
        return res.status(400).json({ error: 'It is White’s turn, not AI’s turn.' });
    }

    let retries = 3;
    let validMove = null;
    let prompt = buildOpenAIPrompt();

    while (retries > 0) {
        const openAiResponse = await callOpenAiForMove(prompt);
        if (!openAiResponse) {
            // AI gave no valid JSON at all, add a note & retry
            prompt += '\nNOTE: Your previous response was invalid or empty. Please return valid JSON.\n';
            retries--;
            continue;
        }

        try {
            const aiMove = JSON.parse(openAiResponse); // e.g. {"from":"e7","to":"e5"}

            // Check if the move is among the current possible moves
            const possible = chess.moves({ verbose: true });
            const found = possible.some(m => m.from === aiMove.from && m.to === aiMove.to);

            if (found) {
                validMove = chess.move({
                    from: aiMove.from,
                    to: aiMove.to,
                    promotion: 'q',
                });
                if (validMove) break; // success
            } else {
                // Not found / invalid
                prompt += `\nNOTE: Move {from:"${aiMove.from}",to:"${aiMove.to}"} is illegal or invalid. Please try again.\n`;
            }
        } catch (err) {
            console.error('Error parsing AI JSON:', err.message);
            prompt += '\nNOTE: Could not parse your JSON. Please output strictly valid JSON.\n';
        }
        retries--;
    }

    if (!validMove) {
        return res
            .status(400)
            .json({ error: 'AI failed to provide a valid move after multiple attempts.' });
    }

    return res.json({
        board: getUnicodeBoard(),
        currentPlayer: chess.turn() === 'w' ? 'white' : 'black',
        history: chess.history({ verbose: true }),
    });
});

/**
 * Build an OpenAI prompt for Black's move.
 * We add detailed instructions in the system content (callOpenAiForMove).
 */
function buildOpenAIPrompt() {
    const fen = chess.fen();
    const board = getUnicodeBoard();
    const allMoves = chess.history({ verbose: true });

    // Let’s show the last 8 moves in textual form
    const recentMovesCount = 8;
    const sliceStart = Math.max(0, allMoves.length - recentMovesCount);
    const recentMoves = allMoves.slice(sliceStart).map((m, index) => {
        const moveNum = allMoves.length - recentMovesCount + index + 1;
        const color = (m.color === 'w' ? 'White' : 'Black');
        return `${moveNum}. ${color} moved ${m.from} -> ${m.to}`;
    });

    // Create a human-readable board to include in the prompt
    const ranks = ['8', '7', '6', '5', '4', '3', '2', '1'];
    let visualBoard = 'Current Board (Top=Black, Bottom=White):\n';
    for (let r = 0; r < 8; r++) {
        visualBoard += ranks[r] + ' | ' + board[r].join('  ') + '\n';
    }
    visualBoard += '    a  b  c  d  e  f  g  h\n';

    // The user is White, we are Black. Provide instructions:
    const prompt = `
FEN: ${fen}

Moves so far (last ${recentMovesCount} moves):
${recentMoves.join('\n') || 'No moves yet.'}

${visualBoard}

It is currently Black's turn. 
You are an advanced chess AI that MUST provide a strictly legal move for Black in JSON only. 
Your JSON format must be EXACTLY:
{
  "from":"<square>",
  "to":"<square>"
}
No extra fields, no extra text. If no legal moves exist, output:
{
  "from":"none",
  "to":"none"
}
Always avoid illegal or repeated moves. Be as challenging as possible.
`;
    return prompt;
}

/**
 * Call OpenAI to get a move suggestion.
 * We pass a strong "system" instruction to avoid illegal moves.
 */
async function callOpenAiForMove(userPrompt) {
    console.log('[OpenAI Prompt] =>', userPrompt);

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o', // or "gpt-3.5-turbo" if you have that
            messages: [
                {
                    role: 'system',
                    content: `
You are an advanced Chess AI playing as Black. 
You must ALWAYS produce a valid, legal chess move in standard algebraic notation 
(e.g., "e7","e5") if one exists. 
Output ONLY valid JSON with "from" and "to" fields, nothing else. 
If no legal moves are possible (checkmate/stalemate), return {"from":"none","to":"none"}.
Do not provide extraneous text or explanation.
        `,
                },
                { role: 'user', content: userPrompt },
            ],
            temperature: 0.2, // lower for more deterministic
            max_tokens: 100,
        });

        const aiResponse = completion.choices[0].message.content.trim();
        console.log('[OpenAI Raw Response] =>', aiResponse);

        // Attempt to isolate a JSON object
        const jsonMatch = aiResponse.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
            const jsonString = jsonMatch[0];
            // Return that raw JSON string (still up to the caller to parse)
            return jsonString;
        }
    } catch (error) {
        console.error('Error calling OpenAI:', error.message);
    }

    // If we got here, there's no valid JSON. Return null so we can retry.
    return null;
}

/**
 * POST /api/reset
 * Reset the game to a new instance of Chess().
 */
app.post('/api/reset', (req, res) => {
    chess = new Chess();
    res.json({
        board: getUnicodeBoard(),
        currentPlayer: chess.turn() === 'w' ? 'white' : 'black',
        history: chess.history({ verbose: true }),
    });
});

// Simple route
app.get('/', (req, res) => {
    res.send('Welcome to the Chess App API! Try /api/board or /api/move, etc.');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
