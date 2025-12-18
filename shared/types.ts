/**
 * Shared Types for Multiplayer Geography Game
 * Used by server, host, and mobile clients
 */

// ===== Game Content =====

export interface Question {
    id: string;
    text: string;
    correctAnswer: LatLon;
    category?: string;
    imageUrl?: string;
}

export interface LatLon {
    lat: number;
    lon: number;
}

// ===== Player Data =====

export interface Player {
    id: string;
    name: string;
    color: string;
    score: number;
    isHost: boolean;
}

export interface PlayerAnswer {
    playerId: string;
    playerName: string;
    lat: number;
    lon: number;
    timestamp: number;
    distance?: number; // Calculated by server
    points?: number;   // Calculated by server
}

// ===== Game State =====

export type GameState =
    | 'lobby'       // Waiting for players (brother's code)
    | 'question'    // Show question
    | 'answering'   // Players placing pins
    | 'reveal'      // Show all answers + arcs
    | 'results';    // Show leaderboard

export interface GameStateData {
    state: GameState;
    currentQuestionIndex: number;
    totalQuestions: number;
    players: Player[];
    answers: PlayerAnswer[];
    correctAnswer?: LatLon;
}

// ===== Socket Events Payload Types =====

// Server → Clients
export interface StateChangePayload {
    state: GameState;
}

export interface QuestionShowPayload {
    question: Question;
    questionNumber: number;
    totalQuestions: number;
}

export interface PlayerAnsweredPayload {
    playerId: string;
    playerName: string;
}

export interface AnswersRevealPayload {
    answers: PlayerAnswer[];
    correctAnswer: LatLon;
}

export interface ResultsShowPayload {
    leaderboard: Player[];
    roundResults: PlayerAnswer[];
}

// Clients → Server
export interface AnswerSubmitPayload {
    lat: number;
    lon: number;
}

export interface GameStartPayload {
    questionCount: number;
}
