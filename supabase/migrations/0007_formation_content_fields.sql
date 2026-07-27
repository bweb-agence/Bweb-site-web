-- Champs de contenu additionnels sur les formations (tous nullables, additifs).
--  audience         : « à qui s'adresse cette formation »
--  prerequisites    : prérequis / à prévoir
--  instructor_name  : nom du formateur
--  instructor_role  : rôle / titre du formateur

alter table public.formations
  add column if not exists audience text,
  add column if not exists prerequisites text,
  add column if not exists instructor_name text,
  add column if not exists instructor_role text;
