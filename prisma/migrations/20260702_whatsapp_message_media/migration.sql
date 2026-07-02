-- Campos de mídia para mensagens de WhatsApp (fotos, vídeos, áudios, documentos)
ALTER TABLE "WhatsappMessage" ADD COLUMN "mediaUrl" TEXT;
ALTER TABLE "WhatsappMessage" ADD COLUMN "mediaType" TEXT;
ALTER TABLE "WhatsappMessage" ADD COLUMN "mediaMimeType" TEXT;
ALTER TABLE "WhatsappMessage" ADD COLUMN "mediaFileName" TEXT;
