import unittest
from unittest.mock import patch

from backchannel.codex_bridge import CodexAppServerBridge, CodexReview


class TestCodexAppServerBridge(unittest.TestCase):
    def test_start_review_uses_read_only_noninteractive_policy(self):
        bridge = CodexAppServerBridge()
        responses = [
            {"thread": {"id": "thread-1"}},
            {"turn": {"id": "turn-1", "status": "inProgress"}},
        ]
        with patch.object(bridge, "start"):
            with patch.object(bridge, "_request", side_effect=responses) as request:
                review = bridge.start_review("Review this flow", "/tmp/workspace")

        self.assertEqual(review["status"], "running")
        self.assertEqual(review["thread_id"], "thread-1")
        self.assertEqual(review["turn_id"], "turn-1")
        thread_params = request.call_args_list[0].args[1]
        turn_params = request.call_args_list[1].args[1]
        self.assertEqual(thread_params["approvalPolicy"], "never")
        self.assertEqual(thread_params["sandbox"], "read-only")
        self.assertEqual(turn_params["sandboxPolicy"], {"type": "readOnly"})

    def test_notifications_stream_and_finalize_agent_output(self):
        bridge = CodexAppServerBridge()
        review = CodexReview(id="review-1", prompt="Review", cwd="/tmp", thread_id="thread-1", turn_id="turn-1", status="running")
        bridge._reviews[review.id] = review
        bridge._review_by_thread["thread-1"] = review.id
        bridge._review_by_turn["turn-1"] = review.id

        bridge._handle_notification({
            "method": "item/agentMessage/delta",
            "params": {"threadId": "thread-1", "turnId": "turn-1", "delta": "Partial"},
        })
        bridge._handle_notification({
            "method": "item/completed",
            "params": {"threadId": "thread-1", "turnId": "turn-1", "item": {"type": "agentMessage", "text": "Final review"}},
        })
        bridge._handle_notification({
            "method": "turn/completed",
            "params": {"threadId": "thread-1", "turn": {"id": "turn-1", "status": "completed"}},
        })

        result = bridge.get_review("review-1")
        self.assertEqual(result["output"], "Final review")
        self.assertEqual(result["status"], "completed")

    def test_status_reports_missing_cli(self):
        bridge = CodexAppServerBridge(command=["missing-codex"])
        with patch("backchannel.codex_bridge.shutil.which", return_value=None):
            status = bridge.status()
        self.assertFalse(status["available"])
        self.assertFalse(status["running"])


if __name__ == "__main__":
    unittest.main()
