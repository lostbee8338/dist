
SELECT
    c."remoteJid",
    COALESCE(c."pushName", '') AS contact_name,
    COALESCE(ch."name", '') AS chat_name
FROM public."Contact" c
LEFT JOIN public."Chat" ch
    ON ch."remoteJid" = c."remoteJid"
    AND ch."instanceId" = c."instanceId"
WHERE c."instanceId" = '0893f0e7-09f2-4229-b9eb-8d08d4d477f3'
  AND c."remoteJid" LIKE '%@s.whatsapp.net'
ORDER BY c."remoteJid";
