-- Privacy is presented as a notice; explicit consent is required for Terms and Community Guidelines.
update public.legal_documents set required=false,updated_at=now() where document_type='privacy';
