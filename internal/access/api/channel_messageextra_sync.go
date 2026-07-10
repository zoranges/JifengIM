package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	runtimechannelid "github.com/WuKongIM/WuKongIM/internal/runtime/channelid"
	"github.com/WuKongIM/WuKongIM/internal/usecase/message"
	"github.com/WuKongIM/WuKongIM/pkg/wklog"
	"github.com/gin-gonic/gin"
)

type syncMessageExtraRequestV1 struct {
	LoginUID     string `json:"login_uid"`
	ChannelID    string `json:"channel_id"`
	ChannelType  uint8  `json:"channel_type"`
	ExtraVersion int64  `json:"extra_version"`
	Limit        int    `json:"limit"`
}

type messageExtraItemV1 struct {
	MessageID    string `json:"message_id_str"`
	MessageSeq   uint64 `json:"message_seq"`
	Revoke       int    `json:"revoke"`
	Revoker      string `json:"revoker,omitempty"`
	ExtraVersion int64  `json:"extra_version"`
}

type cmdPayloadV1 struct {
	Type  int             `json:"type"`
	Cmd   string          `json:"cmd"`
	Param json.RawMessage `json:"param"`
}

type revokeParamV1 struct {
	MessageID  string `json:"message_id"`
	MessageSeq uint64 `json:"message_seq"`
}

func (s *Server) handleChannelMessageExtraSync(c *gin.Context) {
	var req syncMessageExtraRequestV1
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"msg": "数据格式有误！", "status": http.StatusBadRequest})
		return
	}

	s.logger.Info("messageextra_sync 收到请求",
		wklog.String("login_uid", req.LoginUID),
		wklog.String("channel_id", req.ChannelID),
		wklog.Int("channel_type", int(req.ChannelType)),
		wklog.Int64("extra_version", req.ExtraVersion),
		wklog.Int("limit", req.Limit),
	)
	if s == nil || s.messages == nil {
		writeJSONError(c, http.StatusInternalServerError, "message usecase not configured")
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

	result, err := s.messages.SyncChannelMessages(c.Request.Context(), message.SyncChannelMessagesQuery{
		LoginUID:        req.LoginUID,
		ChannelID:       cmdChannelID,
		ChannelType:     req.ChannelType,
		StartMessageSeq: startSeq,
		Limit:           limit,
		PullMode:        message.PullModeUp,
	})
	if err != nil {
		writeJSONError(c, http.StatusInternalServerError, err.Error())
		return
	}

	s.logger.Info("messageextra_sync 读取到命令频道消息",
		wklog.String("cmd_channel_id", cmdChannelID),
		wklog.Int("msg_count", len(result.Messages)),
		wklog.Bool("more", result.More),
	)

	extras := make([]messageExtraItemV1, 0)
	for _, msg := range result.Messages {
		s.logger.Debug("messageextra_sync 检查消息payload",
			wklog.Uint64("msg_seq", msg.MessageSeq),
			wklog.Uint64("msg_id", msg.MessageID),
			wklog.String("from_uid", msg.FromUID),
			wklog.String("payload", string(msg.Payload)),
		)
		var cmd cmdPayloadV1
		if err := json.Unmarshal(msg.Payload, &cmd); err != nil {
			s.logger.Debug("messageextra_sync payload不是JSON，跳过",
				wklog.Uint64("msg_seq", msg.MessageSeq),
				wklog.Error(err),
			)
			continue
		}
		if cmd.Cmd != "messageRevoke" {
			s.logger.Debug("messageextra_sync 非revoke CMD，跳过",
				wklog.String("cmd", cmd.Cmd),
				wklog.Uint64("msg_seq", msg.MessageSeq),
			)
			continue
		}

		var rp revokeParamV1
		if err := json.Unmarshal(cmd.Param, &rp); err != nil {
			s.logger.Warn("messageextra_sync revoke param解析失败",
				wklog.Uint64("msg_seq", msg.MessageSeq),
				wklog.Error(err),
			)
			continue
		}

		messageID := rp.MessageID
		if messageID == "" {
			messageID = strconv.FormatUint(msg.MessageID, 10)
		}
		s.logger.Info("messageextra_sync 发现撤回extra",
			wklog.String("message_id", messageID),
			wklog.Uint64("message_seq", rp.MessageSeq),
			wklog.String("revoker", msg.FromUID),
		)
		extras = append(extras, messageExtraItemV1{
			MessageID:    messageID,
			MessageSeq:   rp.MessageSeq,
			Revoke:       1,
			Revoker:      msg.FromUID,
			ExtraVersion: int64(msg.MessageSeq),
		})
	}

	s.logger.Info("messageextra_sync 返回结果",
		wklog.String("channel_id", req.ChannelID),
		wklog.Int("extra_count", len(extras)),
	)
	c.JSON(http.StatusOK, gin.H{"message_extras": extras})
}
