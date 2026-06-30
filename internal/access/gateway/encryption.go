package gateway

import (
	"encoding/base64"

	coregateway "github.com/WuKongIM/WuKongIM/pkg/gateway"
	"github.com/WuKongIM/WuKongIM/pkg/gateway/wkprotoenc"
	"github.com/WuKongIM/WuKongIM/pkg/protocol/frame"
)

func decryptSendPacketIfNeeded(ctx *coregateway.Context, pkt *frame.SendPacket) (frame.ReasonCode, error) {
	if pkt == nil || ctx == nil || ctx.Session == nil {
		return frame.ReasonSuccess, nil
	}
	if pkt.Setting.IsSet(frame.SettingNoEncrypt) || !wkprotoenc.SessionEncryptionEnabled(ctx.Session) {
		return frame.ReasonSuccess, nil
	}

	plain, err := decryptSendPacketPayload(ctx, pkt)
	if err != nil {
		if err == wkprotoenc.ErrMsgKeyMismatch {
			return frame.ReasonMsgKeyError, err
		}
		return frame.ReasonPayloadDecodeError, err
	}
	pkt.Payload = plain
	pkt.MsgKey = ""
	return frame.ReasonSuccess, nil
}

func isBase64Error(err error) bool {
	_, ok := err.(base64.CorruptInputError)
	return ok
}

func decryptSendPacketPayload(ctx *coregateway.Context, pkt *frame.SendPacket) ([]byte, error) {
	if sessionCrypto, ok := wkprotoenc.SessionCryptoFromSession(ctx.Session); ok {
		plain, err := wkprotoenc.DecryptPayloadWithCrypto(pkt.Payload, sessionCrypto)
		if err != nil {
			if isBase64Error(err) {
				return pkt.Payload, nil
			}
			return nil, err
		}
		return plain, nil
	}
	keys, ok := wkprotoenc.SessionKeysFromSession(ctx.Session)
	if !ok {
		return nil, wkprotoenc.ErrMissingSessionKey
	}
	plain, err := wkprotoenc.DecryptPayload(pkt.Payload, keys)
	if err != nil {
		if isBase64Error(err) {
			return pkt.Payload, nil
		}
		return nil, err
	}
	return plain, nil
}
