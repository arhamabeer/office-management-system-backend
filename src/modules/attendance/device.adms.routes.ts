import { Router, type Request, type Response } from 'express';
import { logger } from '../../common/logger';
import { handshakeOptions, touchDevice, ingestAttlog } from './device.service';

/**
 * ZKTeco ADMS / PUSH protocol endpoints. The DEVICE is the HTTP client here: it
 * dials out to us (configured via its Comm > Cloud Server menu) and POSTs punches
 * as plain tab-delimited text. Mounted at /iclock (NOT under /api) with a text
 * body parser. These endpoints are unauthenticated by the ZK protocol — safety
 * comes from the serial allowlist (a new device is Pending until an admin enables
 * it) and, for public hosting, a TLS reverse proxy + IP allowlist.
 */
const router = Router();

function serialOf(req: Request): string {
  const sn = (req.query.SN ?? req.query.sn) as string | undefined;
  return (sn ?? '').toString().trim();
}

function textOk(res: Response, body = 'OK'): void {
  res.type('text/plain').send(body);
}

// Handshake: device asks for its sync options. Realtime=1 enables push.
router.get('/cdata', (req, res, next) => {
  const serial = serialOf(req);
  if (!serial) {
    textOk(res);
    return;
  }
  touchDevice(serial, req.ip)
    .then(() => res.type('text/plain').send(handshakeOptions(serial)))
    .catch(next);
});

// Data upload. table=ATTLOG carries punches; other tables are acknowledged.
router.post('/cdata', (req, res, next) => {
  const serial = serialOf(req);
  const table = String(req.query.table ?? '').toUpperCase();
  const body = typeof req.body === 'string' ? req.body : '';
  if (!serial) {
    textOk(res);
    return;
  }
  if (table === 'ATTLOG') {
    // Ack with the number of lines the device sent so it advances its pointer;
    // our ingest is idempotent (deduped), so re-sends are harmless.
    const lineCount = body.split(/\r?\n/).filter((l) => l.trim()).length;
    ingestAttlog(serial, body)
      .then((r) => {
        logger.info({ serial, ...r }, 'device: ATTLOG ingested');
        textOk(res, `OK: ${lineCount}`);
      })
      .catch(next);
    return;
  }
  // OPERLOG / options / other tables — acknowledge so the device advances.
  touchDevice(serial, req.ip)
    .then(() => textOk(res, 'OK'))
    .catch(next);
});

// Command poll (heartbeat). No commands queued -> plain OK.
router.get('/getrequest', (req, res, next) => {
  const serial = serialOf(req);
  if (!serial) {
    textOk(res);
    return;
  }
  touchDevice(serial, req.ip)
    .then(() => textOk(res, 'OK'))
    .catch(next);
});

// Command results / biometric templates / ping — acknowledge.
router.post('/devicecmd', (_req, res) => textOk(res));
router.post('/fdata', (_req, res) => textOk(res));
router.get('/ping', (_req, res) => textOk(res));
router.get('/', (_req, res) => textOk(res));

export default router;
