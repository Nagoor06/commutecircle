from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from retrieval import GuideIndex

ROOT = (
    "https://github.com/Nagoor06/commutecircle/blob/main/services/ride-help/guide.md#"
)


class State(TypedDict, total=False):
    question: str
    evidence: list[dict]
    answer: dict


def no_answer():
    return {
        "status": "no_evidence",
        "answer": "The rider guide does not answer that question.",
        "sources": [],
    }


def build_graph(model):
    index = GuideIndex(model)

    def retrieve(state):
        (embedding,) = model.embed([state["question"]])
        return {"evidence": index.search(embedding)}

    def answer(state):
        items = state["evidence"]
        choice = model.select(state["question"], items)
        if type(choice) is not int or not 1 <= choice <= len(items):
            return {"answer": no_answer()}
        doc = items[choice - 1]
        return {
            "answer": {
                "status": "answered",
                "answer": doc["text"],
                "sources": [{"title": doc["title"], "url": ROOT + doc["anchor"]}],
            }
        }

    graph = StateGraph(State)
    graph.add_node("retrieve", retrieve)
    graph.add_node("answer", answer)
    graph.add_node("abstain", lambda _: {"answer": no_answer()})
    graph.add_edge(START, "retrieve")
    graph.add_conditional_edges(
        "retrieve",
        lambda s: "answer" if s["evidence"] else "abstain",
        ["answer", "abstain"],
    )
    graph.add_edge("answer", END)
    graph.add_edge("abstain", END)
    return graph.compile()
