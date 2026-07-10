package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	runtimechannelid "github.com/WuKongIM/WuKongIM/internal/runtime/channelid"
	messageusecase "github.com/WuKongIM/WuKongIM/internalv2/usecase/message"
	"github.com/gin-gonic/gin"
)

type syncMessageExtraRequest struct {
	LoginUID     string `json:"login_uid"`
	ChannelID    string `json:"channel_id"`
	ChannelType  uint8  `json:"channel_type"`
	ExtraVersion int64  `json:"extra_version"`
	Limit        int    `json:"limit"`
}

type syncMessageExtraResponse struct {
	MessageExtras []messageExtraItem `json:"message_extras"`
}

type messageExtraItem struct {
	MessageID    string `json:"message_id_str"`
	MessageSeq   uint64 `json:"message_seq"`
	Revoke       int    `json:"revoke"`
	Revoker      string `json:"revoker,omitempty"`
	ExtraVersion int64  `json:"extra_version"`
}

type cmdPayload struct {
	Type  int             `json:"type"`
	Cmd   string          `json:"cmd"`
	Param json.RawMessage `json:"param"`
}

type revokeParam struct {
	MessageID  string `json:"message_id"`
	MessageSeq uint64 `json:"message_seq"`
}

func (s *Server) handleChannelMessageExtraSync(c *gin.Context) {
	var req syncMessageExtraRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"msg": "数据格式有误！", "status": http.StatusBadRequest})
		return
	}
	if s == nil || s.messages == nil {
		writeJSONError(c, "message usecase not configured")
		return
	}

	cmdChannelID := runtimechannelid.ToCommandChannel(req.ChannelID)

	startSeq := uint64(0)
	if req.ExtraVersion > 0 {
		startSeq = uint64(req.ExtraVersion)
	}

	limit := req.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 1000 {
		limit = 1000
	}

	result, err := s.messages.SyncChannelMessages(c.Request.Context(), messageusecase.SyncChannelMessagesQuery{
		LoginUID:        req.LoginUID,
		ChannelID:       cmdChannelID,
		ChannelType:     req.ChannelType,
		StartMessageSeq: startSeq,
		Limit:           limit,
		PullMode:        messageusecase.PullModeUp,
	})
	if err != nil {
		writeJSONError(c, err.Error())
		return
	}

	extras := make([]messageExtraItem, 0)
	for _, msg := range result.Messages {
		var cmd cmdPayload
		if err := json.Unmarshal(msg.Payload, &cmd); err != nil {
			continue
		}
		if cmd.Cmd != "messageRevoke" {
			continue
		}

		var rp revokeParam
		if err := json.Unmarshal(cmd.Param, &rp); err != nil {
			continue
		}

		messageID := rp.MessageID
		if messageID == "" {
			messageID = strconv.FormatUint(uint64(msg.MessageID), 10)
		}
		extras = append(extras, messageExtraItem{
			MessageID:    messageID,
			MessageSeq:   rp.MessageSeq,
			Revoke:       1,
			Revoker:      msg.FromUID,
			ExtraVersion: int64(msg.MessageSeq),
		})
	}

	c.JSON(http.StatusOK, syncMessageExtraResponse{MessageExtras: extras})
}
