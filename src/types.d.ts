type CandidateChoice = {
    address: string;
    choice: string;
}

type Frontier = {
    position: number;
    leaf: string;
    ommers: string[];
}

type Election = {
    id: string;
    name: string;
    start_height: number;
    end_height: number;
    question: string;
    candidates: CandidateChoice[];
    signature_required: boolean;
    cmx: string;
    nf: string;
    cmx_frontier: Frontier;
}

type Vote = {
    address: string;
    amount: number;
}
