-- Fix auth passwords for pre-existing staff via direct auth.users update
-- Uses pgcrypto bcrypt hashing (available in Supabase)

DO $$
DECLARE
  staff_data RECORD;
  new_hash TEXT;
BEGIN
  -- Staff list: email -> password
  FOR staff_data IN
    SELECT * FROM (VALUES
      ('geraldmogere@gmail.com',        'Nkoroi#Ger03'),
      ('danielmbugua232@gmail.com',     'Nkoroi#Dan02'),
      ('dlenairoshi@gmail.com',         'Nkoroi#Dean04'),
      ('joyceigwora82@gmail.com',       'Nkoroi#Couns06'),
      ('faithtirops@gmail.com',         'Nkoroi#App12'),
      ('denochep@gmail.com',            'Nkoroi#Dennis18'),
      ('eunicemwangangi8@gmail.com',    'Nkoroi#Hum11'),
      ('eunicebedinaadegu@gmail.com',   'Nkoroi#Lang10'),
      ('rebeccamageria@gmail.com',      'Nkoroi#Mat09'),
      ('mulwanthemba@gmail.com',        'Nkoroi#Sci08'),
      ('nathannjuguna90@gmail.com',     'Nkoroi#Nathan27'),
      ('wairimu0895@yahoo.com',         'Nkoroi#Acct15'),
      ('bethnjoki1@gmail.com',          'Nkoroi#Store14'),
      ('jafwande@gmail.com',            'Nkoroi#Juliet23'),
      ('oliviaonyango5@gmail.com',      'Nkoroi#Olivia28'),
      ('atoninyatigo@gmail.com',        'Nkoroi#Dennis19')
    ) AS t(email, password)
  LOOP
    -- Generate bcrypt hash
    new_hash := crypt(staff_data.password, gen_salt('bf'));
    
    -- Update auth.users directly
    UPDATE auth.users
    SET 
      encrypted_password = new_hash,
      updated_at = NOW(),
      confirmation_sent_at = NULL,
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      recovery_sent_at = NULL,
      reauthentication_sent_at = NULL
    WHERE email = staff_data.email;
    
    IF FOUND THEN
      RAISE NOTICE 'Updated password for: %', staff_data.email;
    ELSE
      -- User doesn't exist - create them
      INSERT INTO auth.users (
        id,
        email,
        encrypted_password,
        email_confirmed_at,
        created_at,
        updated_at,
        raw_app_meta_data,
        raw_user_meta_data,
        is_super_admin,
        role
      ) VALUES (
        gen_random_uuid(),
        staff_data.email,
        new_hash,
        NOW(),
        NOW(),
        NOW(),
        '{"provider":"email","providers":["email"]}',
        '{}',
        false,
        'authenticated'
      );
      RAISE NOTICE 'Created new user for: %', staff_data.email;
    END IF;
  END LOOP;
END;
$$;

-- Also ensure identities exist for each user (needed for email sign-in)
DO $$
DECLARE
  u RECORD;
BEGIN
  FOR u IN
    SELECT id, email FROM auth.users
    WHERE email IN (
      'geraldmogere@gmail.com','danielmbugua232@gmail.com','dlenairoshi@gmail.com',
      'joyceigwora82@gmail.com','faithtirops@gmail.com','denochep@gmail.com',
      'eunicemwangangi8@gmail.com','eunicebedinaadegu@gmail.com','rebeccamageria@gmail.com',
      'mulwanthemba@gmail.com','nathannjuguna90@gmail.com','wairimu0895@yahoo.com',
      'bethnjoki1@gmail.com','jafwande@gmail.com','oliviaonyango5@gmail.com',
      'atoninyatigo@gmail.com'
    )
  LOOP
    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, provider_id
    )
    SELECT
      gen_random_uuid(),
      u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email),
      'email',
      NOW(),
      NOW(),
      NOW(),
      u.email
    WHERE NOT EXISTS (
      SELECT 1 FROM auth.identities WHERE user_id = u.id AND provider = 'email'
    );
  END LOOP;
END;
$$;

